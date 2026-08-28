// useWorldInfo — world info (lorebook) state (Phase 2, roadmap 2.1)
//
// Owns every world-info-domain state declaration previously inlined in
// app.mjs setup(): global/character world info collections, editor and
// settings panel flags, editing drafts and UI option constants.
//
// Pattern contract (locked by tests/composables-contract.test.mjs):
// - The composable creates state and returns it; it holds NO business logic.
// - app.mjs calls this composable exactly once per setup() and destructures
//   the returned properties at the original declaration sites, so every
//   identifier keeps its previous name and the provide("appContext") ctx
//   contract is unchanged.
// - Functions operating on this state (token budget, entry normalization,
//   import/export, key parsing) still live in app.mjs until their own
//   roadmap step (2.2) extracts them.

import { ref, reactive } from 'vue';

export function useWorldInfo() {
    // --- Constants ---
    const systemWorldInfoNames = ['自动生图'];

    const worldInfoPositionOptions = [
        { group: '系统提示词', value: 'system_top', label: '最顶层' },
        { group: '系统提示词', value: 'global_note', label: '全局备注' },
        { group: '系统提示词', value: 'before_char', label: '角色设定前' },
        { group: '系统提示词', value: 'after_char', label: '角色设定后' },
        { group: '对话中', value: 'at_depth', label: '按深度插入' },
        { group: '对话中', value: 'user_top', label: '用户消息顶部' },
        { group: '对话中', value: 'assistant_top', label: '助手消息顶部' }
    ];

    // --- Data collections ---
    const globalWorldInfo = ref([]);
    const worldInfo = ref([]);

    // --- Panel / modal flags ---
    const showWorldInfoEditor = ref(false);
    const showWorldInfoSettings = ref(false);
    const worldInfoSettings = reactive({
        scanDepth: 2,
        maxDepth: 0,
    });

    // --- Editing drafts ---
    const editingWorldInfo = reactive({ id: undefined, data: {} });
    const worldInfoKeysText = ref('');

    // --- Context viewer hover state ---
    const currentHoverWorldInfo = ref(null);

    return {
        systemWorldInfoNames,
        worldInfoPositionOptions,
        globalWorldInfo,
        worldInfo,
        showWorldInfoEditor,
        showWorldInfoSettings,
        worldInfoSettings,
        editingWorldInfo,
        worldInfoKeysText,
        currentHoverWorldInfo
    };
}
