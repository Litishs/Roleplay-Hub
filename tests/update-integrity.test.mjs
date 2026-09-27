// 应用内更新的完整性保障：verifyApkChecksum 的行为测试 + 发版/下载侧接线断言。
//
// - 行为部分用 node:crypto 算出真实 SHA-256 构造 sidecar，验证正确/损坏/格式错误
//   三种输入（模块经 vm 加载，crypto 用 node 的 webcrypto 注入，与 WebView 一致）；
// - 接线部分是静态断言：release.yml 必须生成并上传 sidecar，downloadApk 必须在
//   下载完成后、进入安装前强制比对——这两处没法在单测里真跑，用契约守住。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const loadScript = async (relativePath, contextValues = {}) => {
  const context = vm.createContext({ console, ...contextValues });
  context.window ||= {};
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const cleanSource = source.replace(/^export\s*\{([^}]*)\};\s*$/m, (_, exports) => {
    return exports.split(',').map(s => { const n = s.trim(); return 'window.' + n + ' = ' + n + ';\nglobalThis.' + n + ' = ' + n + ';'; }).join('\n');
  });
  vm.runInContext(cleanSource, context, { filename: relativePath });
  return context;
};

const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('verifyApkChecksum: 正确 sidecar 通过，损坏字节被拒，格式错误可辨识', async () => {
  const context = await loadScript('src/modules/update-checker.mjs', { crypto: globalThis.crypto });
  const verify = context.window.verifyApkChecksum;

  const apk = new Uint8Array(2048);
  for (let i = 0; i < apk.length; i++) apk[i] = (i * 7 + 13) & 0xff;
  // sha256sum 的标准输出格式："<hex>  <文件名>"
  const sidecar = `${sha256Hex(apk)}  Roleplay-Hub-2.64-release.apk\n`;

  const good = await verify(apk, sidecar);
  assert.equal(good.ok, true);
  assert.equal(good.expected, sha256Hex(apk));

  // 单字节损坏 → 拒绝，且 expected/actual 都给出（日志可定位）
  const corrupted = Uint8Array.from(apk);
  corrupted[1024] ^= 0xff;
  const bad = await verify(corrupted, sidecar);
  assert.equal(bad.ok, false);
  assert.equal(bad.expected, sha256Hex(apk));
  assert.equal(bad.actual, sha256Hex(corrupted));

  // 大写十六进制的 sidecar 同样通过（大小写不敏感）
  const upper = await verify(apk, sidecar.toUpperCase());
  assert.equal(upper.ok, true);

  // 格式错误/空的 sidecar → 明确的 reason，而不是误判通过
  const malformed = await verify(apk, 'not a checksum file');
  assert.equal(malformed.ok, false);
  assert.equal(malformed.reason, 'malformed checksum file');
  const empty = await verify(apk, '');
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, 'malformed checksum file');
});

test('发版工作流生成并上传 .sha256 sidecar', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.match(workflow, /sha256sum "Roleplay-Hub-\$\{\{ env\.VERSION_NAME \}\}-release\.apk"/);
  assert.match(workflow, /Roleplay-Hub-\*-release\.apk\.sha256/);
});

test('downloadApk 在安装前强制比对 sidecar，不匹配时中止', async () => {
  const checker = await readFile(new URL('../src/modules/update-checker.mjs', import.meta.url), 'utf8');
  // sidecar 资产从 release.assets 里按名查找
  assert.match(checker, /asset\.name === "Roleplay-Hub-" \+ tag \+ "-release\.apk\.sha256"/);
  // 不匹配 → 带 error 返回，不会走到 saveAndInstallApk
  assert.match(checker, /Checksum mismatch: expected " \+ verify\.expected \+ ", got " \+ verify\.actual/);
  // 校验通过/跳过都留有 journal 行为记录
  assert.match(checker, /name: "checksum_verified", result: "ok"/);
});
