// useCharacterState — character card state (Phase 2, roadmap 2.1)
//
// Owns every character-domain state declaration previously inlined in
// app.mjs setup(): the character collection, current selection, editor and
// export modal flags, batch-delete selection, search/pagination state and
// the state-derived computeds (currentCharacter, filteredCharacters,
// displayedCharacters) whose dependencies are all inside this domain.
//
// Pattern contract (locked by tests/composables-contract.test.mjs):
// - The composable creates state and derived state and returns them; it
//   holds NO business logic (no watchers, no network, no persistence).
// - app.mjs calls this composable exactly once per setup() and destructures
//   the returned properties at the original declaration sites, so every
//   identifier keeps its previous name and the provide("appContext") ctx
//   contract is unchanged.
// - Functions operating on this state (create/save/delete characters,
//   persistence, scoped data application) still live in app.mjs until their
//   own roadmap step extracts them.

import { ref, reactive, computed } from 'vue';

export function useCharacterState() {
    // --- Character collection ---
    const characters = ref([]);
    const currentCharacterIndex = ref(-1);
    const lastActiveCharacterId = ref(null); // For persistence

    // --- List UI state ---
    const showAddCharacterMenu = ref(false);
    const characterSearchQuery = ref('');
    const characterDisplayLimit = ref(8);

    // --- Editor / modal flags ---
    const showCharacterEditor = ref(false);
    const showCharacterExportModal = ref(false);
    const characterToExportIndex = ref(null);

    // --- Editing drafts ---
    const editingCharacter = reactive({ id: undefined, data: {} });
    const editorTab = ref('basic'); // 'basic', 'description', 'personality', 'first_mes'

    // --- Batch delete selection ---
    const isBatchDeleteMode = ref(false);
    const selectedCharacterIndices = ref(new Set());

    // --- Derived state (dependencies all inside this domain) ---
    const currentCharacter = computed(() => {
        return currentCharacterIndex.value >= 0 ? characters.value[currentCharacterIndex.value] : null;
    });

    const getCharacterFavoriteTime = (char) => {
        const time = Number(char?.favoriteAt || 0);
        return Number.isFinite(time) && time > 0 ? time : 0;
    };

    const isCharacterFavorite = (char) => getCharacterFavoriteTime(char) > 0;

    const filteredCharacters = computed(() => {
        let result = characters.value.map((char, index) => ({ ...char, originalIndex: index }));

        if (characterSearchQuery.value) {
            const query = characterSearchQuery.value.toLowerCase();
            result = result.filter(char =>
                char.name.toLowerCase().includes(query) ||
                (char.description && char.description.toLowerCase().includes(query))
            );
        }

        // Favorites stay on top, with the most recently favorited first.
        result.sort((a, b) => {
            const favoriteDiff = getCharacterFavoriteTime(b) - getCharacterFavoriteTime(a);
            if (favoriteDiff !== 0) return favoriteDiff;
            const timeA = a.createdAt || 0;
            const timeB = b.createdAt || 0;
            if (timeB !== timeA) return timeB - timeA;
            // Fallback to UUID if timestamps are missing or identical
            return (b.uuid || '').localeCompare(a.uuid || '');
        });

        return result;
    });

    const displayedCharacters = computed(() => {
        return filteredCharacters.value.slice(0, characterDisplayLimit.value);
    });

    const loadMoreCharacters = () => {
        characterDisplayLimit.value += 8;
    };

    return {
        characters,
        currentCharacterIndex,
        lastActiveCharacterId,
        showAddCharacterMenu,
        characterSearchQuery,
        characterDisplayLimit,
        showCharacterEditor,
        showCharacterExportModal,
        characterToExportIndex,
        editingCharacter,
        editorTab,
        isBatchDeleteMode,
        selectedCharacterIndices,
        currentCharacter,
        getCharacterFavoriteTime,
        isCharacterFavorite,
        filteredCharacters,
        displayedCharacters,
        loadMoreCharacters
    };
}
