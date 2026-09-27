// 正则回溯防护测试：containsCatastrophicQuantifier 的形态判定 + processRegex
// 对危险脚本的 fail-closed 行为（跳过并留痕，正文不被冻死也不被破坏）。
import assert from 'node:assert/strict';
import test from 'node:test';

const { useRegexPipeline } = await import('../src/composables/useRegexPipeline.mjs');
const { containsCatastrophicQuantifier } = useRegexPipeline({ regexScripts: { value: [] } });

test('启发式：命中嵌套量词的经典 ReDoS 形态', () => {
    for (const pattern of [
        '(a+)+b',              // 量词化分组再套量词
        '(?:\\w*)*x',          // 同上，非捕获组
        '(a+|b)+c',            // 量词化分组内含分支，分支自带量词
        '(a|a*)+x'             // 同上，量词在另一分支
    ]) {
        assert.equal(containsCatastrophicQuantifier(pattern), true, pattern);
    }
});

test('启发式：无害模式不误杀', () => {
    for (const pattern of [
        '(foo|bar)+z',         // 分支全是字面量，无回溯风险
        'a+b',
        'o{2,4}',
        '(ab)+c',
        '[abc]+',
        '角色名字|另一个名字'
    ]) {
        assert.equal(containsCatastrophicQuantifier(pattern), false, pattern);
    }
});

test('processRegex：危险脚本被跳过且记录日志，安全脚本正常替换', async () => {
    const originalError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args.join(' '));
    try {
        const pipeline = useRegexPipeline({
            regexScripts: {
                value: [
                    { name: '危险正则', regex: '(a+)+b', flags: 'g', replacement: 'X' },
                    { name: '安全正则', regex: '(海|山)', flags: 'g', replacement: '🌊' }
                ]
            }
        });

        const output = pipeline.processRegex('看海aAAAAAb爬山', { isDisplay: true });
        assert.equal(output, '看🌊aAAAAAb爬🌊', '危险脚本未执行，安全脚本正常替换');
        assert.ok(errors.some(line => line.includes('危险正则') && line.includes('ReDoS')), '拦截必须留痕');
    } finally {
        console.error = originalError;
    }
});
