// memory-migration — legacy adoption visibility (v6 §20)
//
// The ledger adopts the v4 summary/profile keys lazily, per scope, and the
// adoption itself is atomic (one save). What users could never see was
// *whether* it happened for a given conversation, so this module derives
// that state from storage alone: no new keys, no writes, no model calls.
//
// Pure module: no storage, no network, no Vue. Contract locks:
// tests/memory-migration-contract.test.mjs.

// Logical storage name; the app storage layer adds the rp_hub_ prefix.
export const MIGRATION_NOTICE_KEY = 'memory_migration_notice_seen';

// Legacy content worth carrying over: done batches, long/short text,
// info-card rows or v4 vector shards. An empty summaries blob (all-zero
// defaults) is not legacy content — adopting it would only create empty
// placeholder entries. Shards matter because a full-backup restore from a
// pre-ledger build leaves memories_<scope> behind with no ledger: most of
// the user's memory text lives in those paragraph digests.
export const hasLegacyContent = ({ summaries = null, profile = null, fragments = null } = {}) => {
    const batches = Array.isArray(summaries?.batches)
        ? summaries.batches.filter(batch => batch && batch.status === 'done')
        : [];
    const hasText = Boolean(
        String(summaries?.long || '').trim() || String(summaries?.short || '').trim()
    );
    const hasProfileRows = Boolean(
        (Array.isArray(profile?.characters) && profile.characters.length > 0)
        || (Array.isArray(profile?.openPlots) && profile.openPlots.length > 0)
    );
    const hasFragments = Array.isArray(fragments) && fragments.some(fragment =>
        String(fragment?.summary || fragment?.paragraph || '').trim());
    return batches.length > 0 || hasText || hasProfileRows || hasFragments;
};

// What an adopted ledger carries, for the "what was migrated" line: legacy
// digests (coverage placeholders + the old long/short text), legacy facts
// (the old info card) and user pins (pins predate adoption and survive it).
export const adoptionStats = (ledger) => {
    const entries = Array.isArray(ledger?.entries) ? ledger.entries : [];
    return {
        digests: entries.filter(entry => entry.kind === 'digest' && entry.meta.legacy).length,
        facts: entries.filter(entry => entry.kind === 'fact' && entry.meta.legacy).length,
        pins: entries.filter(entry => entry.kind === 'pin').length
    };
};

// pending   — legacy content exists and no ledger was ever written: the
//             scope still reads through the v4 fallback path.
// migrated  — a ledger exists and carries adopted legacy entries.
// clean     — nothing to carry over (fresh scope, or rebuilt from scratch).
export const scopeMigrationStatus = ({ ledger = null, summaries = null, profile = null, fragments = null } = {}) => {
    const hasLedger = Boolean(ledger && Array.isArray(ledger.entries));
    const legacy = hasLegacyContent({ summaries, profile, fragments });
    let status = 'clean';
    if (!hasLedger && legacy) status = 'pending';
    else if (hasLedger) {
        const stats = adoptionStats(ledger);
        if (stats.digests > 0 || stats.facts > 0) status = 'migrated';
    }
    return { status, stats: adoptionStats(ledger), legacy };
};

// One-line human summary for the panel status row (UI copy stays Chinese).
export const formatMigrationStatus = ({ status, stats }) => {
    if (status === 'pending') return '旧版记忆待迁移';
    if (status === 'migrated') {
        const parts = [];
        if (stats.digests > 0) parts.push(`${stats.digests} 条摘要`);
        if (stats.facts > 0) parts.push(`${stats.facts} 条信息卡`);
        if (stats.pins > 0) parts.push(`${stats.pins} 条手动记忆`);
        return parts.length > 0 ? `已迁移：${parts.join(' · ')}` : '已迁移';
    }
    return '无需迁移';
};