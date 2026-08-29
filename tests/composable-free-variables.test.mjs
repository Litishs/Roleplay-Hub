// Contract test: every Phase 3.0 pipeline composable must have zero unresolved
// free identifiers — anything used inside the factory must be a module import,
// a destructured dep, a local declaration or a JS global. Catches dep renames
// and missed deps (the _doBatchEmbedMemoryChunks / cloneForStorage class of
// device-caught regressions from Phase 3.0).
// For each factory, compute identifiers used anywhere inside that are not
// declared ANYWHERE inside (params at any depth, var/let/const, function and
// catch declarations) and not module imports or JS/globals. Since we only
// distinguish "internal" vs "must come from outside", flattening inner scopes
// is sound. Skips object property keys, catch params handled.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
import * as parser from '@babel/parser';

const globals = new Set([
    'AbortController', 'AbortSignal', 'Array', 'Boolean', 'Date', 'Error', 'JSON', 'Math', 'Number', 'Object', 'Promise', 'Reflect', 'RegExp', 'Set', 'String', 'Symbol', 'TypeError', 'URL',
    'console', 'document', 'window', 'fetch', 'globalThis', 'location', 'navigator', 'history', 'localStorage', 'crypto',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
    'encodeURIComponent', 'decodeURIComponent', 'encodeURIComponent', 'atob', 'btoa', 'structuredClone', 'getComputedStyle', 'matchMedia',
    'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'undefined', 'eval', 'Intl', 'Map', 'WeakMap', 'WeakSet', 'BigInt'
]);

function addPattern(pat, bound) {
    if (!pat) return;
    switch (pat.type) {
        case 'Identifier': bound.add(pat.name); break;
        case 'ObjectPattern': pat.properties.forEach(p => addPattern(p.value ?? p.argument, bound)); break;
        case 'AssignmentPattern': addPattern(pat.left, bound); break;
        case 'RestElement': addPattern(pat.argument, bound); break;
        case 'ArrayPattern': pat.elements.forEach(e => addPattern(e, bound)); break;
    }
}

function audit(src, file) {
    const srcNoComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const ast = parser.parse(srcNoComments, { sourceType: 'module' });
    const imports = new Set();
    for (const node of ast.program.body) {
        if (node.type === 'ImportDeclaration') for (const s of node.specifiers) imports.add(s.local.name);
    }
    const factory = ast.program.body.find(n => n.type === 'ExportNamedDeclaration' && n.declaration?.type === 'FunctionDeclaration');
    if (!factory) throw new Error('no exported factory');
    const body = factory.declaration.body;

    const bound = new Set(['deps']);
    // module-level declarations outside the factory are also bindings
    for (const node of ast.program.body) {
        if (node.type === 'VariableDeclaration') node.declarations.forEach(d => addPattern(d.id, bound));
        else if (node.type === 'FunctionDeclaration' && node.id) bound.add(node.id.name);
    }
    const used = new Set();

    function walk(node, collecting) {
        if (!node || typeof node.type !== 'string') return;
        switch (node.type) {
            case 'Identifier':
                if (collecting) used.add(node.name);
                break;
            case 'ObjectProperty':
                if (node.computed) walk(node.key, collecting);
                else if (collecting && node.shorthand) used.add(node.key.name); // shorthand { foo } both key and value
                walk(node.value, collecting);
                return;
            case 'ObjectMethod':
            case 'ClassMethod':
                addPattern(node.key, bound); // method name is a key, not a binding, but harmless to bind
                node.params.forEach(p => addPattern(p, bound));
                walk(node.body, collecting);
                return;
            case 'OptionalMemberExpression':
            case 'MemberExpression':
                walk(node.object, collecting);
                if (node.computed) walk(node.property, collecting);
                return;
            case 'FunctionDeclaration':
            case 'FunctionExpression':
                if (node.id) bound.add(node.id.name);
                node.params.forEach(p => addPattern(p, bound));
                walk(node.body, collecting);
                return;
            case 'ArrowFunctionExpression':
                node.params.forEach(p => addPattern(p, bound));
                walk(node.body, collecting);
                return;
            case 'CatchClause':
                addPattern(node.param, bound);
                walk(node.body, collecting);
                return;
            case 'VariableDeclaration':
                node.declarations.forEach(d => { addPattern(d.id, bound); walk(d.init, collecting); });
                return;
            case 'LabeledStatement':
                walk(node.body, collecting);
                return;
            default:
                for (const key of Object.keys(node)) {
                    if (['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
                    const v = node[key];
                    if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && walk(c, collecting));
                    else if (v && typeof v.type === 'string') walk(v, collecting);
                }
        }
    }
    // pass 1: collect all bindings inside the factory
    walk(body, false);
    // pass 2: collect used identifiers
    walk(body, true);

    return [...used].filter(n => !bound.has(n) && !imports.has(n) && !globals.has(n));
}

const composableFiles = [
    'src/composables/useUiTemplatePipeline.mjs',
    'src/composables/useActiveToolPipeline.mjs',
    'src/composables/useDataLoader.mjs',
    'src/composables/useSpecialRules.mjs',
    'src/composables/useVectorMemoryPatrol.mjs',
    'src/composables/useRollingSummary.mjs',
    'src/composables/useRegexPipeline.mjs',
    'src/composables/useStoryBranching.mjs'
];

for (const file of composableFiles) {
    test(`pipeline composable has no unresolved free identifiers: ${file}`, () => {
        const free = audit(readFileSync(join(root, file), 'utf8'));
        assert.deepEqual(free, [], `unresolved identifiers must be declared as deps/imports: ${free.join(', ')}`);
    });
}