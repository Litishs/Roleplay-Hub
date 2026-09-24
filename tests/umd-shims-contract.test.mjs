import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('assets/js UMD shims stay in sync with their ESM sources', async () => {
    // 工坊页（character/index.html）不经 Vite 处理，assets/js/*.js 是
    // src/modules/*.mjs 经 build-umd-shims 单向生成的副本。副本曾经靠手工同步
    // 并实际漂移过；这个测试在 CI 里守住「改了 ESM 源必须重新生成」——
    // --verify 模式下脚本只比较不写盘，产物过期时以非零码退出。
    await execFileAsync(process.execPath, [
        path.join(root, 'scripts', 'build-umd-shims.mjs'),
        '--verify'
    ]);
});
