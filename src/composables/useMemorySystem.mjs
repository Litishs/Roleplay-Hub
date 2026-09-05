// useMemorySystem — memory system state (Phase 2 pilot, roadmap 2.1)
//
// Owns every memory-domain state declaration previously inlined in app.mjs
// setup(): vector/classic memories, rolling summaries, fact layer, memory
// settings, search UI state and the in-flight guards for async memory flows.
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
    const MEMORY_VECTOR_BATCH_SIZE = 16;
    const MEMORY_VECTOR_SAVE_EVERY_BATCHES = 4;
    const MEMORY_VECTOR_MAX_PARAGRAPH_LENGTH = 1800;
    const MEMORY_VECTOR_MERGE_MAX_LENGTH = 400;
    const MEMORY_VECTOR_MIN_TOP_K = 10;
    const MEMORY_VECTOR_MAX_TOP_K = 20;
    const MEMORY_VECTOR_DEFAULT_TOP_K = 10;
    const MEMORY_VECTOR_MIN_SIMILARITY = 40;
    const MEMORY_VECTOR_MAX_SIMILARITY = 70;
    const MEMORY_VECTOR_DEFAULT_SIMILARITY = 50;
    const MEMORY_VECTOR_DEFAULT_DEPTH = 1;
    const CLASSIC_MEMORY_MIN_CONCURRENCY = 1;
    const MEMORY_MODE_VECTOR = 'vector';
    const VECTOR_KEEP_FLOORS_MIN = 8;
    const VECTOR_KEEP_FLOORS_MAX = 40;
    const VECTOR_KEEP_FLOORS_DEFAULT = 16;
    const SUMMARY_BATCH_SIZE_MIN = 4;
    const SUMMARY_BATCH_SIZE_MAX = 24;
    const SUMMARY_BATCH_SIZE_DEFAULT = 12;
    const MIN_CONTEXT_FLOORS = 6;          // 原文现场窗口下限（质量保底）
    const LIST_PAGE_SIZE = 10;

    // --- Core memory state ---
    const memories = ref([]);
    // 遗留数据兼容：classicMemories 不再写入，仅保留 ref 供旧数据查看/导出逻辑引用
    const classicMemories = ref([]);
    const classicMemoryPage = ref(1);
    // --- 滚动摘要（记忆重构 P0：原文真相源 + 派生摘要层） ---
    const memorySummaries = ref(null);
    const memoryProfile = ref(null);
    const summaryProgress = ref(null); // {fromTurn,toTurn,status:'running'|'done'|'failed'}
    let _summaryInFlight = false;
    let _summaryAbortController = null;
    let _summaryDoneTimer = null;
    const memorySettings = reactive({
        enabled: false,
        mode: MEMORY_MODE_VECTOR,
        embeddingModel: '',
        classicModel: '',
        keepFloors: VECTOR_KEEP_FLOORS_DEFAULT,
        summaryBatchSize: SUMMARY_BATCH_SIZE_DEFAULT,
        vectorTopK: MEMORY_VECTOR_DEFAULT_TOP_K,
        similarityThreshold: MEMORY_VECTOR_DEFAULT_SIMILARITY,
        defaultDepth: MEMORY_VECTOR_DEFAULT_DEPTH,
        embeddingBackend: 'api',        // 'api' | 'local'
        localEmbeddingModel: 'bge-small-zh-v1.5',
        memoryProviderId: ''             // 记忆供应商（滚动总结/嵌入），空=聊天供应商
    });
    const isBatchExtracting = ref(false);
    const batchExtractProgress = ref({ current: 0, total: 0 });
    // 分片生成状态（自动补录可见性）：idle | building | done | error
    const sliceBuildStatus = ref({ status: 'idle', message: '' });
    const vectorMemorySearchQuery = ref('');
    const vectorMemorySearchResults = ref([]);
    const vectorMemorySearchError = ref('');
    const vectorMemorySearchSortMode = ref('time');
    const isVectorMemorySearching = ref(false);
    const memoryGraphView = ref('list');
    const isClassicBatchExtracting = ref(false);
    const classicBatchExtractProgress = ref({ current: 0, total: 0 });
    let _vectorMemorySearchAbort = null;
    let _memoriesLoaded = false; // 标志：防止在记忆加载前 saveData 覆盖已存数据
    let _classicMemoriesLoaded = false;

    // --- Memory panel modal flags ---
    const showNoMemoryNeededModal = ref(false);
    const showMemorySettings = ref(false);

    return {
        // constants
        MEMORY_VECTOR_BATCH_SIZE,
        MEMORY_VECTOR_SAVE_EVERY_BATCHES,
        MEMORY_VECTOR_MAX_PARAGRAPH_LENGTH,
        MEMORY_VECTOR_MERGE_MAX_LENGTH,
        MEMORY_VECTOR_MIN_TOP_K,
        MEMORY_VECTOR_MAX_TOP_K,
        MEMORY_VECTOR_DEFAULT_TOP_K,
        MEMORY_VECTOR_MIN_SIMILARITY,
        MEMORY_VECTOR_MAX_SIMILARITY,
        MEMORY_VECTOR_DEFAULT_SIMILARITY,
        MEMORY_VECTOR_DEFAULT_DEPTH,
        CLASSIC_MEMORY_MIN_CONCURRENCY,
        MEMORY_MODE_VECTOR,
        VECTOR_KEEP_FLOORS_MIN,
        VECTOR_KEEP_FLOORS_MAX,
        VECTOR_KEEP_FLOORS_DEFAULT,
        SUMMARY_BATCH_SIZE_MIN,
        SUMMARY_BATCH_SIZE_MAX,
        SUMMARY_BATCH_SIZE_DEFAULT,
        MIN_CONTEXT_FLOORS,
        LIST_PAGE_SIZE,
        // core state
        memories,
        classicMemories,
        classicMemoryPage,
        memorySummaries,
        memoryProfile,
        summaryProgress,
        memorySettings,
        isBatchExtracting,
        batchExtractProgress,
        sliceBuildStatus,
        vectorMemorySearchQuery,
        vectorMemorySearchResults,
        vectorMemorySearchError,
        vectorMemorySearchSortMode,
        isVectorMemorySearching,
        memoryGraphView,
        isClassicBatchExtracting,
        classicBatchExtractProgress,
        // module-level guards (mutable bindings — destructure with `let` in app.mjs)
        _summaryInFlight,
        _summaryAbortController,
        _summaryDoneTimer,
        _vectorMemorySearchAbort,
        _memoriesLoaded,
        _classicMemoriesLoaded,
        // modal flags
        showNoMemoryNeededModal,
        showMemorySettings
    };
}
