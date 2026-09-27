// downloadApk 断点续传的行为测试：模块经 vm 加载，fetch 用桩按场景投递响应，
// 响应体用宿主的真实 ReadableStream（模块只调 getReader()/read()，跨 realm 可用）。
// 覆盖：中断后续传成功 / 服务器忽略 Range 时从头重来 / 重试耗尽 / 416 收尾。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const loadScript = async (contextValues = {}) => {
    const context = vm.createContext({ console, setTimeout, clearTimeout, AbortController, AbortSignal, ...contextValues });
    context.window ||= {};
    const source = await readFile(new URL('../src/modules/update-checker.mjs', import.meta.url), 'utf8');
    const cleanSource = source.replace(/^export\s*\{([^}]*)\};\s*$/m, (_, exports) => {
        return exports.split(',').map(s => { const n = s.trim(); return 'window.' + n + ' = ' + n + ';\nglobalThis.' + n + ' = ' + n + ';'; }).join('\n');
    });
    vm.runInContext(cleanSource, context, { filename: 'update-checker.mjs' });
    return context.window;
};

const MIB = 1024 * 1024;
const TOTAL = 5 * MIB + 16; // 须 ≥ MIN_APK_SIZE(5MiB)，否则触发"过小"保护

const chunk = (start, end) => {
    const bytes = new Uint8Array(end - start);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (start + i) & 0xff;
    return bytes;
};

// 生成一个伪响应：body 是显式步骤脚本——依次返回 value 块，遇 error 步骤抛出，
// 步骤走完后 done。不借助 ReadableStream：按流规范 error() 会清空未读队列，
// "先 enqueue 后 error"的桩在真实环境里也拿不到那个块，显式脚本才是确定性的。
const streamResponse = (status, contentLength, steps) => {
    let index = 0;
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => (contentLength == null ? null : String(contentLength)) },
        body: {
            getReader: () => ({
                read: async () => {
                    if (index >= steps.length) return { done: true, value: undefined };
                    const step = steps[index++];
                    if (step.error) throw step.error;
                    return { done: false, value: step.value };
                }
            })
        }
    };
};

// 构造带投递队列的 fetch 桩：APK 之外的 URL（release API）返回固定清单。
const makeFetchStub = (apkResponses) => {
    const calls = [];
    const fetch = async (url, init = {}) => {
        calls.push({ url: String(url), headers: { ...(init.headers || {}) } });
        if (String(url).includes('/releases/latest')) {
            return { ok: true, json: async () => ({ tag_name: 'v2.64', body: '', assets: [] }) };
        }
        const next = apkResponses.shift();
        if (!next) throw new Error('stub queue exhausted');
        return next();
    };
    fetch.calls = calls;
    fetch.apkCalls = () => calls.filter(call => call.url.includes('.apk'));
    return fetch;
};

test('下载中断后带 Range 续传，拼接结果完整且进度单调', async () => {
    const firstChunkEnd = 3 * MIB;
    const fetchStub = makeFetchStub([
        () => streamResponse(200, TOTAL, [
            { value: chunk(0, firstChunkEnd) },
            { error: new Error('network reset') }
        ]),
        () => streamResponse(206, TOTAL - firstChunkEnd, [
            { value: chunk(firstChunkEnd, TOTAL) }
        ])
    ]);
    const { downloadApk } = await loadScript({ fetch: fetchStub });

    const progress = [];
    const result = await downloadApk(ratio => progress.push(ratio));

    assert.equal(result.error, null);
    assert.equal(result.tag, '2.64');
    assert.equal(result.data.length, TOTAL);
    assert.equal(result.data[firstChunkEnd - 1], (firstChunkEnd - 1) & 0xff, '断点前的字节来自第一次尝试');
    assert.equal(result.data[firstChunkEnd], firstChunkEnd & 0xff, '断点后的字节来自第二次尝试');
    assert.equal(fetchStub.apkCalls().length, 2);
    assert.equal(fetchStub.apkCalls()[1].headers.Range, `bytes=${firstChunkEnd}-`, '第二次尝试必须带 Range 断点头');
    for (let i = 1; i < progress.length; i++) {
        assert.ok(progress[i] >= progress[i - 1], '进度必须单调不减');
    }
});

test('服务器忽略 Range 返回 200 时，丢弃已收字节从头重来', async () => {
    const fetchStub = makeFetchStub([
        () => streamResponse(200, TOTAL, [
            { value: chunk(0, 100) },
            { error: new Error('connection lost') }
        ]),
        () => streamResponse(200, TOTAL, [
            { value: chunk(0, TOTAL) }
        ])
    ]);
    const { downloadApk } = await loadScript({ fetch: fetchStub });

    const result = await downloadApk();
    assert.equal(result.error, null);
    assert.equal(result.data.length, TOTAL, '必须是完整重下的结果，而不是 100 字节残片接全量');
});

test('重试耗尽后返回带尝试次数的错误，且每次重试带断点头', async () => {
    const fetchStub = makeFetchStub([
        () => streamResponse(200, TOTAL, [{ error: new Error('network down') }]),
        () => streamResponse(200, TOTAL, [{ error: new Error('network down') }]),
        () => streamResponse(200, TOTAL, [{ error: new Error('network down') }]),
        () => streamResponse(200, TOTAL, [{ error: new Error('network down') }])
    ]);
    const { downloadApk } = await loadScript({ fetch: fetchStub });

    const result = await downloadApk();
    assert.match(result.error, /after 4 attempt\(s\): network down/);
    assert.equal(fetchStub.apkCalls().length, 4);
    // 一个字节都没收到过：不带 Range 头（无断点可续），仅做普通重试。
    assert.equal(fetchStub.apkCalls()[3].headers.Range, undefined);
});

test('416 恰好收到全量时视为完成，不误报失败', async () => {
    const fetchStub = makeFetchStub([
        () => streamResponse(200, TOTAL, [
            { value: chunk(0, TOTAL) },
            { error: new Error('reset right at the end') }
        ]),
        () => streamResponse(416, null, [])
    ]);
    const { downloadApk } = await loadScript({ fetch: fetchStub });

    const result = await downloadApk();
    assert.equal(result.error, null);
    assert.equal(result.data.length, TOTAL);
});

test('404 是确定性失败，不消耗重试', async () => {
    const fetchStub = makeFetchStub([
        () => ({ ok: false, status: 404, headers: { get: () => null }, body: null })
    ]);
    const { downloadApk } = await loadScript({ fetch: fetchStub });

    const result = await downloadApk();
    assert.equal(result.error, 'APK not found for this version');
    assert.equal(fetchStub.apkCalls().length, 1);
});
