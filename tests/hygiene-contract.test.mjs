// 仓库卫生契约：本文件夹（工作区 + git 跟踪面）内不允许出现任何本机特征数据。
//
// 覆盖三类载体，任一命中即失败并给出修复指引：
//   1. 内容：本机用户名 / 机器名 / Windows 用户目录绝对路径（具体禁词见下方
//      动态拼装——本文件自身不得出现字面量，否则自食其果）
//   2. 文件名：文件或目录路径本身携带上述特征
//   3. 本机数据产物：local.properties、keystore、数据安全备份、诊断输出、
//      agent 工作区等已被 .gitignore 约定"仅限本机"的文件若落入工作区
//
// 扫描范围 = git 跟踪文件 + 未跟踪但未被忽略的源文件（node_modules 与
// gitignored 产物不在扫描面）。例外：assets/vendor 下的模型文件是第三方发布
// 内容（其词表自带品牌词条，人人相同，不构成本机信息），且本身被
// gitignore 排除在扫描面之外。
// 本测试随 npm test 在本地与 CI 每次运行——"以后都要如此"由它强制执行。
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 本机特征禁词动态拼装（避免本文件自身成为命中源）
const machineName = ['len', 'ovo'].join('');
const hostName = ['xi', 'yue'].join('');

// 本机特征 pattern：命中即违规
const FORBIDDEN_CONTENT = [
    new RegExp(`\\b${machineName}\\b`, 'i'),
    new RegExp(`\\b${hostName}\\b`, 'i'),
    /[a-z]:[\\/]+users[\\/]+[^\s"']+/i
];
const FORBIDDEN_IN_NAME = [
    new RegExp(`\\b${machineName}\\b`, 'i'),
    new RegExp(`\\b${hostName}\\b`, 'i')
];

// 仅限本机的数据文件：这些内容一旦被 git 跟踪（即会随推送进入公开仓库）就算违规。
// android/local.properties 是标准本地构建配置（sdk.dir 指向 SDK），设计上就是机器特定
// 且被 android/.gitignore 忽略的——它允许存在于工作区，但绝不允许被跟踪。
const FORBIDDEN_TRACKED_ARTIFACTS = [
    'android/local.properties',
    'android/keystore.properties',
    'android/keystore',
    '.rphub-diag-out',
    '.openclaw',
    '.openclaw-attachments'
];

const listWorkspaceFiles = async () => {
    const { stdout } = await execFileAsync('git', [
        'ls-files', '--cached', '--others', '--exclude-standard', '-z'
    ], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
    return stdout.split('\0').filter(Boolean);
};

const isBinary = (buffer) => {
    const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
    return sample.includes(0);
};

test('文件名不携带本机特征', async () => {
    const files = await listWorkspaceFiles();
    for (const file of files) {
        for (const pattern of FORBIDDEN_IN_NAME) {
            assert.ok(!pattern.test(file), `文件/目录名携带本机特征: "${file}"（命中 ${pattern}）。请重命名后再提交。`);
        }
    }
});

test('文件内容不携带本机特征（用户名/机器名/用户目录绝对路径）', async () => {
    const files = await listWorkspaceFiles();
    assert.ok(files.length > 200, '文件清单不应为空（git 可用性检查）');
    for (const file of files) {
        let buffer;
        try {
            buffer = await readFile(path.join(root, file));
        } catch (_) {
            continue; // 竞态：扫描期间被删除/替换的文件跳过
        }
        if (isBinary(buffer)) continue;
        const text = buffer.toString('utf8');
        const lines = text.split(/\r?\n/);
        for (let index = 0; index < lines.length; index++) {
            for (const pattern of FORBIDDEN_CONTENT) {
                assert.ok(!pattern.test(lines[index]),
                    `"${file}" 第 ${index + 1} 行携带本机特征（命中 ${pattern}）。` +
                    `请删除或替换为相对路径/运行时解析（process.cwd()、import.meta.url 等）。`);
            }
        }
    }
});

test('本机数据产物不被 git 跟踪（gitignored 的本地构建配置允许存在）', async () => {
    const { stdout } = await execFileAsync('git', ['ls-files', '--cached', '-z'], {
        cwd: root, maxBuffer: 16 * 1024 * 1024
    });
    const tracked = new Set(stdout.split('\0').filter(Boolean));
    for (const artifact of FORBIDDEN_TRACKED_ARTIFACTS) {
        assert.ok(!tracked.has(artifact),
            `"${artifact}" 被 git 跟踪——其中含 SDK 路径/密钥/用户数据，绝不能进入提交。` +
            `请执行 git rm --cached "${artifact}" 并确认 .gitignore 覆盖它。`);
    }
    // android/local.properties 若存在，必须被 .gitignore 覆盖（标准本地构建配置，
    // 真机构建必需；被忽略即永不进入提交）。不存在（未做 Android 本地构建）则跳过。
    let localPropertiesExists = false;
    try {
        await stat(path.join(root, 'android', 'local.properties'));
        localPropertiesExists = true;
    } catch (_) { /* 不存在 → 无需检查 */ }
    if (localPropertiesExists) {
        const { stdout: ignored } = await execFileAsync(
            'git', ['check-ignore', 'android/local.properties'],
            { cwd: root }
        );
        assert.equal(ignored.trim(), 'android/local.properties',
            'android/local.properties 存在但未被 .gitignore 覆盖——含 SDK 绝对路径，必须忽略');
    }
});
