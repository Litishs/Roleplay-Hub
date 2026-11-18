// Contract test: v6 migration visibility (§20).
//
// The adoption itself is already atomic and lazy; this layer only makes it
// visible: a derived per-scope status (no new storage), the background
// sweep queue, the sidebar capsule, the chat strip and the one-time notice.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    MIGRATION_NOTICE_KEY,
    adoptionStats,
    formatMigrationStatus,
    hasLegacyContent,
    scopeMigrationStatus
} from '../src/modules/memory-migration.mjs';
import { adoptScopeLegacy, createEmptyLedger, makeDigestEntry } from '../src/modules/memory-ledger.mjs';

const [app, panel, sidenav, modal, messageList, useMemorySystem] = await Promise.all([
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/views/MemoryPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/common/SideNav.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/common/ModalDialog.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/chat/MessageList.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useMemorySystem.mjs', import.meta.url), 'utf8')
]);

test('migration: legacy content detection ignores empty blobs', () => {
    assert.equal(hasLegacyContent({}), false);
    assert.equal(hasLegacyContent({ summaries: { long: '', short: '', batches: [] } }), false);
    assert.equal(hasLegacyContent({ summaries: { long: '', short: '', batches: [{ fromTurn: 1, toTurn: 2, status: 'done' }] } }), true);
    assert.equal(hasLegacyContent({ summaries: { long: '旧长期', short: '', batches: [] } }), true);
    assert.equal(hasLegacyContent({ profile: { characters: [{ name: '甲', status: '状态' }], openPlots: [] } }), true);
    assert.equal(hasLegacyContent({ summaries: { batches: [{ fromTurn: 1, toTurn: 2, status: 'failed' }] } }), false,
        'failed-only batches carry nothing adoptable');
});

test('migration: per-scope status is derived, never stored', () => {
    const pending = scopeMigrationStatus({ summaries: { long: '旧', short: '', batches: [] } });
    assert.equal(pending.status, 'pending');
    const ledger = createEmptyLedger();
    const migrated = scopeMigrationStatus({ ledger, summaries: { long: '旧', short: '', batches: [] } });
    assert.equal(migrated.status, 'clean', 'an empty ledger means nothing was adopted yet');
    ledger.entries.push(makeDigestEntry({ id: 'legacy-1', covers: [], text: '旧长期', level: 1, legacy: true, at: 1 }));
    const done = scopeMigrationStatus({ ledger });
    assert.equal(done.status, 'migrated');
    assert.deepEqual(done.stats, { digests: 1, facts: 0, pins: 0 });
    assert.equal(scopeMigrationStatus({}).status, 'clean');
});

test('migration: status labels are human-readable and promise exit safety', () => {
    assert.equal(formatMigrationStatus(scopeMigrationStatus({})), '无需迁移');
    assert.equal(formatMigrationStatus(scopeMigrationStatus({ summaries: { long: '旧', short: '', batches: [] } })), '旧版记忆待迁移');
    const ledger = createEmptyLedger();
    ledger.entries.push(makeDigestEntry({ id: 'legacy-1', covers: [], text: '旧长期', level: 1, legacy: true, at: 1 }));
    assert.equal(formatMigrationStatus(scopeMigrationStatus({ ledger })), '已迁移：1 条摘要');
    assert.ok(modal.includes('任何时刻退出应用都不会丢记忆'), 'the notice promises exit safety');
    assert.ok(panel.includes('任何时刻退出应用最多丢失正在写入的一条'), 'the panel repeats the atomicity promise');
});

test('migration: adoptScopeLegacy mirrors reconcile step 0 without touching storage', () => {
    const turnCovers = new Map([[1, [{ id: 'u1', h: 'h' }, { id: 'a1', h: 'h' }]]]);
    const summaries = { long: '旧长期', short: '', batches: [{ fromTurn: 1, toTurn: 1, status: 'done' }] };
    const profile = { characters: [{ name: '甲', status: '状态' }], openPlots: [] };
    let seq = 0;
    const adopted = adoptScopeLegacy({ summaries, profile, turnCovers, makeId: () => `id-${++seq}`, now: 5 });
    assert.ok(adopted);
    assert.equal(adopted.profileAdopted, true);
    assert.equal(adopted.entries.filter(entry => entry.kind === 'digest').length, 2,
        'coverage placeholder + legacy text entry');
    assert.equal(adopted.entries.filter(entry => entry.kind === 'fact').length, 1);
    // Idempotent: a second call over the produced ledger adopts nothing.
    assert.equal(adoptScopeLegacy({ ledger: adopted, summaries, profile, turnCovers, makeId: () => 'x', now: 6 }), null);
    // No legacy content, no ledger: nothing to do.
    assert.equal(adoptScopeLegacy({ turnCovers, makeId: () => 'x', now: 6 }), null);
});

test('migration: adoption stats count legacy rows and pins', () => {
    const ledger = createEmptyLedger();
    ledger.entries.push(makeDigestEntry({ id: 'd1', covers: [], text: '旧', level: 1, legacy: true, at: 1 }));
    ledger.entries.push(makeDigestEntry({ id: 'd2', covers: [{ id: 'u1', h: 'h' }], text: '新批次', at: 2 }));
    assert.deepEqual(adoptionStats(ledger), { digests: 1, facts: 0, pins: 0 },
        'only legacy digests count as migrated content');
    assert.deepEqual(adoptionStats(null), { digests: 0, facts: 0, pins: 0 });
});

test('migration: app wires the background sweep and the notice gate', () => {
    assert.ok(app.includes('const startMemoryMigrationScan = async () => {'));
    assert.ok(app.includes('const adoptScopeLegacyNow = async (scopeId'));
    assert.ok(app.includes('const runMemoryMigrationQueue = async (queue'));
    assert.ok(app.includes('const migrateAllMemoryNow = async () => {'));
    assert.ok(app.includes('startMemoryMigrationScan().catch'), 'scan never blocks or crashes startup');
    assert.ok(app.includes('const seen = await getStoredValue(MIGRATION_NOTICE_KEY)'), 'notice shows once');
    assert.ok(app.includes("setStoredValue(MIGRATION_NOTICE_KEY, true)"));
    assert.ok(app.includes('notifyAdoption: (ledger) => {'), 'lazy adoption also flashes the chat strip');
    assert.ok(useMemorySystem.includes('memoryMigration') && useMemorySystem.includes('memoryMigrationFlash'));
    assert.equal(MIGRATION_NOTICE_KEY, 'memory_migration_notice_seen');
});

test('migration: UI surfaces progress without blocking anything', () => {
    // Sidebar capsule while the sweep runs.
    assert.ok(sidenav.includes('memoryMigrationBadge'));
    assert.ok(app.includes('memoryMigrationBadge: computed'));
    // Chat strip: running + green confirmation with what was carried over.
    assert.ok(messageList.includes('正在过继本会话旧记忆…（可续，退出不丢）'));
    assert.ok(messageList.includes('旧记忆已过继到账本'));
    assert.ok(app.includes('memoryMigrationRunningHere: computed'));
    // Panel: status row, foreground batch button, backup entry, progress bar.
    assert.ok(panel.includes('迁移状态'));
    assert.ok(panel.includes('migrateAllMemoryNow()'));
    assert.ok(panel.includes('导出备份'));
    assert.ok(panel.includes('memoryMigration.done }}/{{ memoryMigration.total'));
    // One-time notice modal with the backup-first action.
    assert.ok(modal.includes('showMemoryMigrationNotice'));
    assert.ok(modal.includes('记忆系统已升级'));
    assert.ok(modal.includes('先导出备份'));
    assert.ok(modal.includes('closeMemoryMigrationNotice'));
});

test('migration: the sweep never calls the model and survives interruption', () => {
    // adoptScopeLegacy is pure storage-level synthesis: no fetch, no prompt.
    const source = app.slice(app.indexOf('const adoptScopeLegacyNow'), app.indexOf('const runMemoryMigrationQueue'));
    assert.ok(!source.includes('requestBatchDigest'));
    assert.ok(!source.includes('fetch('));
    assert.ok(source.includes('setScopedStoredValue(\'memory_ledger\''), 'one atomic save per scope');
    // Queue failures are logged and skipped; later scopes still migrate.
    assert.ok(app.includes('Memory migration failed for scope:'));
});