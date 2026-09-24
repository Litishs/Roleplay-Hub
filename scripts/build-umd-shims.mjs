// 从 ESM 源生成 character/index.html 用的 UMD 垫片。
//
// 背景：工坊页（character/index.html）不经 Vite 处理，靠 <script> 直接加载
// assets/js/*.js，所以同一份逻辑长期存在两个副本——src/modules/card-utils.mjs
// 与 assets/js/card-utils.js 曾是 690 行逐字节相同、手工同步的孪生文件。
// 漂移过一次之后补的是「字符串匹配测试」，只能守住几个特定片段。
// 这里改成从 ESM 单向生成，副本不再可能漂移。
//
// 转换是纯机械的：剥掉 import / export / globalThis 赋值，把
// `const X = {` 还原成 `window.X = {`，再套一层 IIFE。生成物与源文件的差异
// 因此永远只有这层外壳。
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

// [ESM 源, UMD 产物, 导出名, 从 'vue' 导入时改写成的全局解构]
const SHIMS = [
    ['src/modules/card-utils.mjs', 'assets/js/card-utils.js', 'RPHubCardUtils', null],
    ['src/modules/ui-select.mjs', 'assets/js/ui-select.js', 'RPHubCustomSelect', 'Vue']
];

const BANNER = (sourcePath) => `// 由 scripts/build-umd-shims.mjs 从 ${sourcePath} 生成，请勿直接编辑。
// 修改请改 ESM 源文件，然后运行 \`npm run build:umd-shims\`（build:web 会自动执行）。
`;

export const toUmd = (source, exportName, globalNamespace) => {
    let code = source;

    // `import { a, b } from 'vue';` -> `const { a, b } = Vue;`
    if (globalNamespace) {
        code = code.replace(
            /^import\s*\{([^}]+)\}\s*from\s*['"]vue['"];?[ \t]*\r?\n/m,
            (_, names) => `    const {${names}} = ${globalNamespace};\n`
        );
    }

    // 其余 import 一律不支持：UMD 垫片没有模块加载器，静默丢弃会产出坏文件。
    const leftoverImport = code.match(/^import\s.+$/m);
    if (leftoverImport) {
        throw new Error(`${exportName}: 无法转换的 import，UMD 垫片不支持模块依赖 -> ${leftoverImport[0]}`);
    }

    // `const X =  {` -> `window.X = {`（导出对象改为挂在 window 上）
    const declarationPattern = new RegExp(`^\\s*const\\s+${exportName}\\s*=\\s*`, 'm');
    if (!declarationPattern.test(code)) {
        throw new Error(`${exportName}: 找不到导出声明，源文件结构可能已变`);
    }
    code = code.replace(declarationPattern, `    window.${exportName} = `);

    // 剥掉 ESM 尾部的导出与全局赋值（UMD 里由上面的 window.X 承担）。
    code = code
        .replace(new RegExp(`^export\\s*\\{\\s*${exportName}\\s*\\};?[ \\t]*\\r?\\n?`, 'm'), '')
        .replace(new RegExp(`^globalThis\\.${exportName}\\s*=\\s*${exportName};?[ \\t]*\\r?\\n?`, 'm'), '')
        .replace(new RegExp(`^if\\s*\\(typeof window[^\\n]*\\)\\s*window\\.${exportName}\\s*=\\s*${exportName};?[ \\t]*\\r?\\n?`, 'm'), '');

    if (/^export\s/m.test(code)) {
        throw new Error(`${exportName}: 仍有未处理的 export 语句`);
    }

    return `(function () {\n${code.replace(/\s+$/, '')}\n})();\n`;
};

// --verify：只校验不写盘，供测试与 CI 判断产物是否与源同步。
const verifyOnly = process.argv.includes('--verify');
let stale = 0;

for (const [sourcePath, targetPath, exportName, globalNamespace] of SHIMS) {
    const absoluteSource = path.join(root, sourcePath);
    if (!existsSync(absoluteSource)) {
        throw new Error(`缺少 ESM 源文件: ${sourcePath}`);
    }

    const source = await readFile(absoluteSource, 'utf8');
    const expected = BANNER(sourcePath) + toUmd(source, exportName, globalNamespace);
    const absoluteTarget = path.join(root, targetPath);
    const current = existsSync(absoluteTarget) ? await readFile(absoluteTarget, 'utf8') : null;

    if (current === expected) continue;

    if (verifyOnly) {
        console.error(`[umd-shims] ${targetPath} 与 ${sourcePath} 不同步`);
        stale++;
        continue;
    }

    await writeFile(absoluteTarget, expected);
    console.log(`[umd-shims] 已生成 ${targetPath}`);
}

if (stale > 0) {
    console.error('[umd-shims] 请运行 `npm run build:umd-shims` 重新生成');
    process.exit(1);
}
