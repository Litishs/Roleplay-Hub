// useMemorySystem — memory system state (Phase 2 pilot, roadmap 2.1)
//
// Owns every memory-domain state declaration previously inlined in app.mjs
// setup(): classic (legacy, read-only) memories, the v6 ledger, rolling
// summary state, fact layer, memory settings and the in-flight guards for
// async memory flows. The vector/embedding stack was removed in v6 L3.
//
// Pattern contract (locked by tests/composables-contract.test.mjs):
// - The composable creates state and returns it; it holds NO business logic.
// - app.mjs calls this composable exactly once per setup() and destructures
//   the returned properties at the original declaration sites, so every
//   identifier keeps its previous name and the provide("appContext") ctx
//   contract is unchanged.
// - Functions that operate on this state still live in app.mjs until their
//   own roadmap step (2.2) extracts them.

import { ref, reactive } from 'vue';

export function useMemorySystem() {
    // --- Memory tuning constants ---
    const CLASSIC_MEMORY_MIN_CONCURRENCY = 1;
    const MEMORY_KEEP_FLOORS_MIN = 8;
    const MEMORY_KEEP_FLOORS_MAX = 40;
    const MEMORY_KEEP_FLOORS_DEFAULT = 16;
    const SUMMARY_BATCH_SIZE_MIN = 4;
    const SUMMARY_BATCH_SIZE_MAX = 24;
    const SUMMARY_BATCH_SIZE_DEFAULT = 12;
    const MIN_CONTEXT_FLOORS = 6;          // 原文现场窗口下限（质量保底）
    const LIST_PAGE_SIZE = 10;

    // --- Core memory state ---
    // 遗留数据兼容：classicMemories 不再写入，仅保留 ref 供旧数据查看/导出逻辑引用
    const classicMemories = ref([]);
    const classicMemoryPage = ref(1);
    // --- 滚动摘要（记忆重构 P0：原文真相源 + 派生摘要层） ---
    const memorySummaries = ref(null);
    const memoryProfile = ref(null);
    // v6 ledger (L1): append-only derived store; memorySummaries above stays
    // as the folded projection consumed by the unchanged panel/injection.
    const memoryLedger = ref(null);
    const summaryProgress = ref(null); // {fromTurn,toTurn,status:'running'|'done'|'failed'}
    let _summaryInFlight = false;
    let _summaryAbortController = null;
    let _summaryDoneTimer = null;
    const memorySettings = reactive({
        enabled: false,
        classicModel: '',
        keepFloors: MEMORY_KEEP_FLOORS_DEFAULT,
        summaryBatchSize: SUMMARY_BATCH_SIZE_DEFAULT,
        profileStaleAfter: 40,           // 信息卡过期标注轮数（10–100，v5 M2）
        // v6 L5: hierarchical compaction (design doc §9.1). Turning it off
        // rolls the ledger back to a flat level-0 shape; the fanout is the
        // per-level fold threshold (4–8, tuned in the panel).
        compactionEnabled: true,
        compactionFanout: 5,
        memoryProviderId: ''             // 记忆供应商（滚动总结），空=聊天供应商
    });
    const memoryGraphView = ref('list');
    const isClassicBatchExtracting = ref(false);
    const classicBatchExtractProgress = ref({ current: 0, total: 0 });
    let _classicMemoriesLoaded = false;

    // --- Memory migration visibility (v6 §20) ---
    // Progress of the background legacy-adoption sweep: total = scopes found
    // pending at scan time, done = scopes carried into the ledger so far.
    const memoryMigration = reactive({
        scanned: false,
        total: 0,
        done: 0,
        running: false,
        activeScope: '',
        finishedFlash: false
    });
    const memoryMigrationFlash = ref(null);   // { scopeId, stats, at } for the chat strip
    const showMemoryMigrationNotice = ref(false);

    // --- Memory panel modal flags ---
    const showNoMemoryNeededModal = ref(false);
    const showMemorySettings = ref(false);

    return {
        // constants
        CLASSIC_MEMORY_MIN_CONCURRENCY,
        MEMORY_KEEP_FLOORS_MIN,
        MEMORY_KEEP_FLOORS_MAX,
        MEMORY_KEEP_FLOORS_DEFAULT,
        SUMMARY_BATCH_SIZE_MIN,
        SUMMARY_BATCH_SIZE_MAX,
        SUMMARY_BATCH_SIZE_DEFAULT,
        MIN_CONTEXT_FLOORS,
        LIST_PAGE_SIZE,
        // core state
        classicMemories,
        classicMemoryPage,
        memorySummaries,
        memoryProfile,
        memoryLedger,
        summaryProgress,
        memorySettings,
        memoryGraphView,
        isClassicBatchExtracting,
        classicBatchExtractProgress,
        // module-level guards (mutable bindings — destructure with `let` in app.mjs)
        _summaryInFlight,
        _summaryAbortController,
        _summaryDoneTimer,
        _classicMemoriesLoaded,
        // modal flags
        showNoMemoryNeededModal,
        showMemorySettings,
        // migration visibility
        memoryMigration,
        memoryMigrationFlash,
        showMemoryMigrationNotice
    };
}