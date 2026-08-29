// useCardOperations — character card operations (Phase 2, roadmap 2.2)
//
// Owns the card CRUD / selection logic previously inlined in app.mjs setup():
// createNewCharacter / editCharacter / saveCharacter, deleteCharacter /
// toggleCharacterFavorite / batch-delete (toggleBatchDeleteMode,
// toggleCharacterSelection, batchDeleteCharacters), the character-card press
// animation handlers, and selectCharacter (character switch: scoped storage,
// chat/branch/worldinfo/memory loading, default regex setup).
//
// Pattern contract (locked by tests/composables-contract.test.mjs):
// - deps-injecting logic factory; app.mjs destructures the returned functions
//   right before parseWorldInfoKeysText (all deps defined by then; every call
//   site is runtime-only).
// - The shared data-load guard `let _isApplyingCharacterScopedData` stays in
//   app.mjs: the moved code flips it through the injected
//   setApplyingCharacterScopedData() bridge instead of the raw binding.
// - The storage handle is injected as getDb() (app.mjs reassigns its `let db`
//   when initDB/reopenMainDB runs, so a value-captured binding would go stale)

import { generateUUID } from '../modules/utils.mjs';

export function useCardOperations(deps) {
    const {
        // character state
        characters,
        currentCharacterIndex,
        currentCharacter,
        editingCharacter,
        editorTab,
        showCharacterEditor,
        isBatchDeleteMode,
        selectedCharacterIndices,
        isCharacterFavorite,
        // chat / conversation state
        chatHistory,
        isConversationBusy,
        recentGenerationTimes,
        worldInfo,
        // app shell state / defaults
        currentView,
        showAutoImageGenModal,
        defaultAvatar,
        // storage layer
        getDb,
        initDB,
        saveData,
        setStoredValue,
        deleteScopedStoredValue,
        collectCharacterScopeIds,
        getStoryBranchScopeId,
        activeStoryBranchId,
        // app.mjs orchestration (persistence / confirm / toast / chat view)
        saveChatHistoryNow,
        flushPendingChatHistorySave,
        confirmAction,
        showToast,
        scrollChatToBottom,
        resetChatRenderWindow,
        stopGeneration,
        stopSpeaking,
        waitForConversationIdle,
        // memory pipeline
        loadCharacterMemories,
        abortVectorBatchExtraction,
        abortClassicBatchExtraction,
        abortRollingSummary,
        // ui-template runtime
        abortUiTemplateUpdate,
        normalizeUiTemplate,
        normalizeCharacterUiTemplates,
        loadGlobalUiTemplateRuntimeForCharacter,
        saveGlobalUiTemplateRuntimeForCharacter,
        // character-scoped data-load guard
        finishApplyingCharacterScopedData,
        setApplyingCharacterScopedData,
        // regex / image-gen rules
        normalizeRegexScript,
        combineRegexScriptsForCharacter,
        ensureDefaultUserRegex,
        enforceSpecialRules,
        updateImageGenRegexState,
        isAutoImageGenEnabled,
        // chat / branch / worldinfo loading
        loadStoredChatHistory,
        loadStoryBranchesForCharacter,
        getCombinedWorldInfo,
    } = deps;

        const createNewCharacter = () => {
            editingCharacter.id = undefined;
            editingCharacter.data = {
                name: 'New Character',
                description: '',
                first_mes: 'Hello!',
                avatar: defaultAvatar,
                personality: '',
                mes_example: '',
                uuid: generateUUID(),
                createdAt: Date.now(),
                uiTemplates: []
            };
            editorTab.value = 'basic';
            showCharacterEditor.value = true;
        };

        const editCharacter = (index) => {
            const char = characters.value[index];
            if (!char) {
                console.error('Invalid character index:', index);
                return;
            }
            editingCharacter.id = index;
            editingCharacter.data = JSON.parse(JSON.stringify(char));
            editorTab.value = 'basic';
            showCharacterEditor.value = true;
        };

        const saveCharacter = () => {
            const characterRegexScripts = (editingCharacter.data.regexScripts || [])
                .map(script => normalizeRegexScript({ ...script, scope: 'character' }, 'character'))
                .filter(script => script.scope !== 'global');
            const normalizedCharacterData = {
                ...editingCharacter.data,
                regexScripts: characterRegexScripts,
                uiTemplates: (editingCharacter.data.uiTemplates || []).map(template => normalizeUiTemplate({ ...template, scope: 'character' }))
            };
            delete normalizedCharacterData.scenario;
            if (editingCharacter.id !== undefined) {
                characters.value[editingCharacter.id] = normalizedCharacterData;
            } else {
                characters.value.push(normalizedCharacterData);
            }
            showCharacterEditor.value = false;
            showToast('角色已保存', 'success');
        };

        const deleteCharacter = (index) => {
            confirmAction('确定要删除这个角色吗？此操作无法撤销。', async () => {
                try {
                    const char = characters.value[index];
                    if (char && char.uuid) {
                        if (!getDb()) await initDB();
                        const scopeIds = await collectCharacterScopeIds(char);
                        await Promise.all(scopeIds.flatMap(scopeId => [
                            deleteScopedStoredValue('chat', scopeId),
                            deleteScopedStoredValue('memories', scopeId),
                            deleteScopedStoredValue('classic_memories', scopeId),
                            deleteScopedStoredValue('memory_summaries', scopeId),
                            deleteScopedStoredValue('memory_profile', scopeId),
                            getDb().deleteFragments(scopeId)
                        ]));
                        await deleteScopedStoredValue('branches', char.uuid);
                    }

                    characters.value.splice(index, 1);
                    if (currentCharacterIndex.value === index) {
                        currentCharacterIndex.value = -1;
                        chatHistory.value = [];
                    } else if (currentCharacterIndex.value > index) {
                        currentCharacterIndex.value--;
                    }
                    showToast('角色已删除', 'success');
                } catch (err) {
                    console.error('Failed to delete character or associated data:', err);
                    showToast('删除角色失败', 'error');
                }
            });
        };

        const toggleCharacterFavorite = (index) => {
            const char = characters.value[index];
            if (!char) return;

            if (isCharacterFavorite(char)) {
                const { favoriteAt, ...characterData } = char;
                characters.value[index] = characterData;
                showToast('已取消收藏', 'info');
            } else {
                characters.value[index] = {
                    ...char,
                    favoriteAt: Date.now()
                };
                showToast('已收藏角色卡', 'success');
            }
            saveData({ saveMemories: false });
        };

        const toggleBatchDeleteMode = () => {
            isBatchDeleteMode.value = !isBatchDeleteMode.value;
            selectedCharacterIndices.value.clear();
        };

        const toggleCharacterSelection = (index) => {
            if (selectedCharacterIndices.value.has(index)) {
                selectedCharacterIndices.value.delete(index);
            } else {
                selectedCharacterIndices.value.add(index);
            }
        };

        const batchDeleteCharacters = () => {
            if (selectedCharacterIndices.value.size === 0) return;

            confirmAction(`确定要删除选中的 ${selectedCharacterIndices.value.size} 个角色吗？此操作无法撤销。`, async () => {
                try {
                    const currentUUID = currentCharacter.value ? currentCharacter.value.uuid : null;
                    const indices = Array.from(selectedCharacterIndices.value).sort((a, b) => b - a);

                    for (const index of indices) {
                        const char = characters.value[index];
                        if (char && char.uuid) {
                            if (!getDb()) await initDB();
                            const scopeIds = await collectCharacterScopeIds(char);
                            await Promise.all(scopeIds.flatMap(scopeId => [
                                deleteScopedStoredValue('chat', scopeId),
                                deleteScopedStoredValue('memories', scopeId),
                                deleteScopedStoredValue('classic_memories', scopeId),
                                deleteScopedStoredValue('memory_summaries', scopeId),
                                deleteScopedStoredValue('memory_profile', scopeId),
                                getDb().deleteFragments(scopeId)
                            ]));
                            await deleteScopedStoredValue('branches', char.uuid);
                        }
                        characters.value.splice(index, 1);
                    }

                    if (currentUUID) {
                        const newIndex = characters.value.findIndex(c => c.uuid === currentUUID);
                        currentCharacterIndex.value = newIndex;
                        if (newIndex === -1) chatHistory.value = [];
                    } else {
                        currentCharacterIndex.value = -1;
                    }

                    showToast('删除成功', 'success');
                    toggleBatchDeleteMode();
                } catch (err) {
                    console.error('Batch delete failed:', err);
                    showToast('删除失败', 'error');
                }
            });
        };

        // 角色卡按压动画（同步上游 main 热修）：pointerdown 缩小、松开回弹
        const characterCardPressStates = new WeakMap();
        const beginCharacterCardPress = (event) => {
            const card = event.currentTarget;
            const previousState = characterCardPressStates.get(card);
            if (previousState?.timer) clearTimeout(previousState.timer);
            card.classList.remove('is-card-releasing');
            card.classList.add('is-card-pressing');
            characterCardPressStates.set(card, { startedAt: performance.now(), releasing: false, timer: null });
        };
        const endCharacterCardPress = (event) => {
            const card = event.currentTarget;
            const state = characterCardPressStates.get(card);
            if (!state || state.releasing) return;
            state.releasing = true;
            state.timer = setTimeout(() => {
                card.classList.remove('is-card-pressing');
                card.classList.add('is-card-releasing');
                state.timer = setTimeout(() => {
                    card.classList.remove('is-card-releasing');
                    characterCardPressStates.delete(card);
                }, 180);
            }, Math.max(0, 120 - (performance.now() - state.startedAt)));
        };

        const selectCharacter = async (index, isNewImport = false) => {
            if (isConversationBusy.value) {
                stopGeneration();
                const stopped = await waitForConversationIdle();
                await saveChatHistoryNow();
                if (!stopped) {
                    showToast('正在停止生成，请稍后再切换角色卡', 'warning');
                    return;
                }
            }
            await flushPendingChatHistorySave();
            abortUiTemplateUpdate();
            stopSpeaking();
            const previousCharacterIndex = currentCharacterIndex.value;
            const previousCharacter = currentCharacter.value;
            if (previousCharacterIndex !== index) {
                abortVectorBatchExtraction();
                abortClassicBatchExtraction();
                abortRollingSummary();
            }
            const char = characters.value[index];
            if (!char) {
                showToast('角色不存在，无法读取聊天记录', 'error');
                return;
            }

            let loadedChatHistory;
            let initialBranchScopeId = null;
            try {
                if (!char.uuid) {
                    char.uuid = generateUUID();
                    if (!getDb()) await initDB();
                    await setStoredValue('characters', characters.value);
                }
                await loadStoryBranchesForCharacter(char);
                initialBranchScopeId = getStoryBranchScopeId(char.uuid, activeStoryBranchId.value);
                loadedChatHistory = await loadStoredChatHistory(char, index, initialBranchScopeId);
            } catch (error) {
                console.error('Error loading chat history:', error);
                showToast('聊天记录读取失败，已保留当前会话且不会覆盖原记录，请稍后重试', 'error', 5000);
                return;
            }

            setApplyingCharacterScopedData(true);
            if (previousCharacterIndex !== -1 && previousCharacterIndex !== index) {
                saveGlobalUiTemplateRuntimeForCharacter(previousCharacter);
            }
            currentCharacterIndex.value = index;
            resetChatRenderWindow();
            normalizeCharacterUiTemplates(char);
            if (previousCharacterIndex !== index) {
                loadGlobalUiTemplateRuntimeForCharacter(char);
            }
            chatHistory.value = loadedChatHistory;
            resetChatRenderWindow();

            // Load Character Specific Data
            worldInfo.value = getCombinedWorldInfo(char);

            combineRegexScriptsForCharacter(char);
            finishApplyingCharacterScopedData();

            if (char.recentGenerationTimes) {
                recentGenerationTimes.value = JSON.parse(JSON.stringify(char.recentGenerationTimes));
            } else {
                recentGenerationTimes.value = [];
            }

            ensureDefaultUserRegex();

            // Enforce special rules (Nai画图正则 & 自动生图)
            enforceSpecialRules();

            // Sync image style rules
            if (isAutoImageGenEnabled.value) {
                const messages = updateImageGenRegexState({ enableRegex: true });
                if (messages && messages.length > 0) {
                    showToast('已同步生图风格：' + messages.join('，'), 'success');
                }
            }

            await loadCharacterMemories(initialBranchScopeId);

            currentView.value = 'chat';
            await scrollChatToBottom();
            showToast(`已切换到角色: ${char.name}`, 'success');

            // 弹出自动生图询问 (仅在导入新卡时)
            if (isNewImport) {
                showAutoImageGenModal.value = true;
            }

            saveData(); // Save the switch immediately
        };

    return {
        createNewCharacter, editCharacter, saveCharacter,
        deleteCharacter, toggleCharacterFavorite, toggleBatchDeleteMode,
        toggleCharacterSelection, batchDeleteCharacters,
        beginCharacterCardPress, endCharacterCardPress, selectCharacter
    };
}
