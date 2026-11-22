// memory-profile — legacy info-card shape + injection rendering (v6 L4)
//
// L4 moved the info card into the ledger: fact entries are projected into
// the `card` view by memory-view.mjs, and this module only keeps the parts
// that are still used outside the fold:
//   - normalizeProfile/createEmptyProfile for the v4 memory_profile key and
//     old JSON exports (read-only adoption input, §11);
//   - buildProfileContext for the <role_profile> block, which now accepts
//     either a legacy profile or the projected card (same field names).
//
// The merge family (mergeCharacters / mergeOpenPlots / mergeRelations) and
// the relations field were deleted in L4 — the ledger projection replaces
// them (design doc §10 / §3.3).
//
// Contract locks: tests/memory-profile-contract.test.mjs.

const createEmptyProfile = () => ({
    characters: [],
    openPlots: [],
    updatedAt: 0
});

// Old data may still carry `relations`; it is a dead field since v4 and is
// deliberately dropped on normalization (design doc §10).
const normalizeProfile = (profile) => {
    const source = profile && typeof profile === 'object' ? profile : {};
    return {
        characters: Array.isArray(source.characters) ? source.characters : [],
        openPlots: Array.isArray(source.openPlots) ? source.openPlots : [],
        updatedAt: Number(source.updatedAt) || 0
    };
};

// v6 freshness is exact: lastSeenTurn is projected from the still-live
// covers, not from "the model last mentioned it" (design doc §5.4). Rows
// with no live covers (pins / manual facts / adopted legacy rows) are never
// annotated as stale.
const isProfileStale = (entry, currentTurn, staleAfter = 40) => {
    const lastSeenTurn = Math.floor(Number(entry?.lastSeenTurn) || 0);
    const turn = Math.floor(Number(currentTurn) || 0);
    if (!turn || !lastSeenTurn) return false;
    const threshold = Math.max(1, Math.floor(Number(staleAfter) || 40));
    return turn - lastSeenTurn >= threshold;
};

/**
 * Build the <role_profile> injection block ({{user}} centered, compact).
 * Accepts either the legacy profile shape or the memory-view card — both
 * expose characters[].name/status/lastSeenTurn and openPlots[].summary/
 * status/deadline/lastSeenTurn.
 */
const buildProfileContext = (profile, options = {}) => {
    const current = normalizeProfile(profile);
    const currentTurn = Math.max(0, Math.floor(Number(options.currentTurn) || 0));
    const staleAfter = Math.max(1, Math.floor(Number(options.staleAfter) || 40));
    const staleNote = (entry) => (
        isProfileStale(entry, currentTurn, staleAfter) ? `（第${entry.lastSeenTurn}轮后未再出现）` : ''
    );
    const parts = [];
    const activeCharacters = current.characters.filter(char => String(char.status || '').trim());
    if (activeCharacters.length > 0) {
        const lines = activeCharacters.map(char => `${char.name}:${char.status}${staleNote(char)}`);
        parts.push(`<character_status>${lines.join('; ')}</character_status>`);
    }
    const open = current.openPlots.filter(plot => plot.status !== 'closed');
    if (open.length > 0) {
        const lines = open.map(plot => {
            const label = plot.deadline ? `${plot.summary}（${plot.deadline}）` : plot.summary;
            return `${label}${staleNote(plot)}`;
        });
        parts.push(`<open_plots>${lines.join('; ')}</open_plots>`);
    }
    if (parts.length === 0) return '';
    return [
        '<role_profile>',
        '  <description>以下为记忆动态信息卡：剧情中变化的角色动态状态与未决伏笔；静态角色关系以世界书为准，不在此重复。</description>',
        ...parts.map(part => indent(part, 2)),
        '</role_profile>'
    ].join('\n');
};

const indent = (text, spaces) => {
    const pad = ' '.repeat(spaces);
    return String(text).split('\n').map(line => `${pad}${line}`).join('\n');
};

export { createEmptyProfile, normalizeProfile, isProfileStale, buildProfileContext };