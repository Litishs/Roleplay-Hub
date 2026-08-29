// useDataIO — import / export data pipeline (Phase 2, roadmap 2.2)
//
// Owns the data transfer logic previously inlined in app.mjs setup(): the
// export-modal / chat-import-dialog / import-preview state, JSON file download
// and read helpers, fingerprint dedupe, per-domain export entry mappers,
// importUiTemplates, the character import pipeline (PNG/JSON/JSONL with
// preserved-field fidelity and chat-import confirmation), character export
// (JSON / chat JSONL / PNG), and the generic export modal + preset/regex/
// worldinfo import handlers hoisted out of the setup() return object.
//
// Pattern contract (locked by tests/composables-contract.test.mjs):
// - deps-injecting logic factory; app.mjs destructures the returned functions
//   and state refs right after the useCardOperations wiring (all deps defined
//   by then). The ctx return references the same names unchanged.
// - downloadJsonFile and readJsonFileInput stay exported because remaining
//   app.mjs callers (request diagnostics export, memory import) use them.
// - No mutable-binding bridges were needed: the only `let` reassignments in
//   the moved code belong to locals inside importCharacter.
// - The moved code is verbatim from app.mjs except for the deps destructuring,
//   the state refs created here, and the property-to-const hoisting of the
//   ctx-inline handlers.

import { ref } from 'vue';
import { generateUUID } from '../modules/utils.mjs';

export function useDataIO(deps) {
    const {
        // character / conversation state
        characters,
        currentCharacterIndex,
        currentCharacter,
        chatHistory,
        characterToExportIndex,
        showCharacterExportModal,
        selectCharacter,
        showAddCharacterMenu,
        defaultAvatar,
        // collection state + editors
        presets,
        editingPreset,
        showPresetEditor,
        regexScripts,
        editingRegex,
        showRegexEditor,
        worldInfo,
        activeTools,
        editingActiveTool,
        normalizeActiveTool,
        normalizeActiveTools,
        showActiveToolEditor,
        ACTIVE_TOOL_RESULT_COUNT_VERSION,
        // ui-template runtime
        currentUiTemplates,
        ensureCurrentUiTemplates,
        ensureGlobalUiTemplates,
        normalizeUiTemplate,
        cloneUiObject,
        hasUiTemplateScripts,
        // item normalization
        normalizeWorldInfoEntry,
        normalizeRegexScript,
        normalizePreset,
        // story branch / scoped storage
        activeStoryBranchId,
        getStoryBranchScopeId,
        getCurrentStoryBranchScopeId,
        getScopedStoredValue,
        setScopedStoredValue,
        // app.mjs orchestration
        saveData,
        confirmAction,
        showToast,
        cardUtils,
    } = deps;

    // Export Modal State
    const showExportModal = ref(false);
    const exportType = ref(null); // 'presets', 'regex', 'worldinfo', 'uitemplates'
    const exportItems = ref([]);
    const selectedExportIndices = ref(new Set());
    // Chat Import Dialog State (overwrite / append confirmation)
    const showChatImportDialog = ref(false);
    const chatImportDialog = ref(null); // { characterName, totalCount, validCount, invalidCount, apply(mode) }
    // Import Preview Dialog State (dedupe / validation summary for presets, regex, world info)
    const showImportPreview = ref(false);
    const importPreview = ref(null); // { title, itemLabel, totalCount, newCount, duplicateCount, invalidCount, apply() }

        const openCharacterExportModal = (index) => {
            characterToExportIndex.value = index;
            showCharacterExportModal.value = true;
        };

        const confirmCharacterExport = async (type) => {
            showCharacterExportModal.value = false;
            if (characterToExportIndex.value !== null) {
                if (type === 'json') {
                    await exportCharacterJson(characterToExportIndex.value);
                } else if (type === 'chat') {
                    await exportCharacterChat(characterToExportIndex.value);
                } else {
                    await exportCharacterPng(characterToExportIndex.value);
                }
                characterToExportIndex.value = null;
            }
        };

        const confirmChatImportOverwrite = async () => {
            const dialog = chatImportDialog.value;
            showChatImportDialog.value = false;
            chatImportDialog.value = null;
            if (dialog?.apply) await dialog.apply('overwrite');
        };

        const confirmChatImportAppend = async () => {
            const dialog = chatImportDialog.value;
            showChatImportDialog.value = false;
            chatImportDialog.value = null;
            if (dialog?.apply) await dialog.apply('append');
        };

        const cancelChatImport = () => {
            showChatImportDialog.value = false;
            chatImportDialog.value = null;
        };

        const confirmImportPreview = () => {
            const preview = importPreview.value;
            showImportPreview.value = false;
            importPreview.value = null;
            if (preview?.apply) preview.apply();
        };

        const cancelImportPreview = () => {
            showImportPreview.value = false;
            importPreview.value = null;
        };

        const toRegexExportEntry = (script = {}, fallbackScope = 'character') => (
            cardUtils.toRegexExportEntry(normalizeRegexScript(script, fallbackScope))
        );

        const toUiTemplateExportEntry = (template = {}) => {
            const normalized = normalizeUiTemplate(template);
            return cardUtils.toUiTemplateExportEntry(normalized);
        };

        const sanitizeUiTemplateImportEntry = (template = {}) => {
            const { changeLog, runtimeByCharacter, variableState, model, version, ...cleanTemplate } = template || {};
            if (!cleanTemplate.initialVariableState && !cleanTemplate.variables && variableState && typeof variableState === 'object') {
                cleanTemplate.initialVariableState = cloneUiObject(variableState);
            }
            return cleanTemplate;
        };

        const downloadJsonFile = async (data, fileName, spacing = 2, options = {}) => {
            const json = typeof data === 'string' ? data : JSON.stringify(data, null, spacing);
            const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
            const result = await cardUtils.downloadBlob(blob, fileName, options);
            return { blob, result };
        };

        // --- Import dedupe / preview helpers ---
        // Stable canonical JSON stringify (object key order independent) used as a
        // content fingerprint for detecting duplicate imports.
        const stableJsonStringify = (value) => {
            if (value === null || typeof value !== 'object') return JSON.stringify(value);
            if (Array.isArray(value)) return '[' + value.map(stableJsonStringify).join(',') + ']';
            const keys = Object.keys(value).sort();
            return '{' + keys.map(key => JSON.stringify(key) + ':' + stableJsonStringify(value[key])).join(',') + '}';
        };
        const importItemFingerprint = (item, fields) => {
            const picked = {};
            (fields || []).forEach(field => {
                if (item[field] !== undefined && item[field] !== null && item[field] !== '') {
                    picked[field] = item[field];
                }
            });
            return stableJsonStringify(picked);
        };

        const readJsonFileInput = (event, handleData, handleError) => {
            const input = event.target;
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async ({ target }) => {
                try {
                    await handleData(JSON.parse(target.result));
                } catch (error) {
                    handleError(error);
                } finally {
                    input.value = '';
                }
            };
            reader.onerror = () => {
                handleError(reader.error || new Error('读取文件失败'));
                input.value = '';
            };
            reader.readAsText(file);
        };

        const importUiTemplates = (event) => readJsonFileInput(event, data => {
            const templates = Array.isArray(data) ? data : (Array.isArray(data.templates) ? data.templates : []);
            if (!templates.length) throw new Error('未找到模板数组');
            const normalized = templates.map(t => {
                const cleanTemplate = sanitizeUiTemplateImportEntry(t);
                return normalizeUiTemplate({ ...cleanTemplate, id: generateUUID(), enabled: cleanTemplate.enabled === true ? true : false });
            });
            const globalTemplates = normalized.filter(template => template.scope === 'global');
            const characterTemplates = normalized.filter(template => template.scope !== 'global');
            if (characterTemplates.length && !currentCharacter.value) {
                showToast('绑定角色卡的模板需要先选择角色卡', 'warning');
                return;
            }
            // G2：含可执行脚本（<script>/内联事件/iframe）的模板先确认再导入
            const riskyCount = normalized.filter(template => hasUiTemplateScripts(template.htmlTemplate)).length;
            const applyImport = () => {
                ensureGlobalUiTemplates().push(...globalTemplates);
                ensureCurrentUiTemplates().push(...characterTemplates);
                saveData();
                showToast(
                    riskyCount
                        ? `成功导入 ${normalized.length} 个UI模板（其中 ${riskyCount} 个含可执行脚本，仅信任来源时使用）`
                        : `成功导入 ${normalized.length} 个UI模板`,
                    riskyCount ? 'warning' : 'success',
                    4000
                );
            };
            if (riskyCount) {
                confirmAction(
                    `导入的模板中有 ${riskyCount} 个包含可执行脚本（<script>、内联事件属性或 iframe）。模板脚本在 Shadow DOM 中运行，但不受沙箱隔离，可以访问本地数据。仅导入你信任的模板。确定继续导入吗？`,
                    applyImport
                );
            } else {
                applyImport();
            }
        }, error => showToast(`UI模板导入失败: ${error.message}`, 'error'));

        const toWorldInfoExportEntry = (entry) => {
            const normalized = normalizeWorldInfoEntry(entry);
            return cardUtils.toWorldInfoExportEntry(normalized);
        };

        const importCharacter = (event) => {
            const file = event.target.files[0];
            if (!file) return;

            showAddCharacterMenu.value = false;

            // Reset file input
            event.target.value = '';

            const processCharacterData = async (rawData, avatarUrl) => {
                try {
                    let charData = rawData;
                    let characterBook = null;
                    let regexScripts = null;
                    let uiTemplates = null;

                    // --- External Card Data Structure Parsing ---

                    // Wrapped cards store the actual character fields in a 'data' object.
                    if (rawData.data) {
                        charData = rawData.data;
                    }

                    // --- Preserve External Card Fields for Lossless Round-Trip ---
                    // SillyTavern / TavernAI cards carry fields this app does not edit
                    // (mes_example, system_prompt, post_history_instructions,
                    // alternate_greetings, tags, creator, character_version, spec, spec_version)
                    // plus foreign extension data (world, depth_prompt, ...). Earlier versions
                    // deleted them, which made a single import -> export cycle lossy. We keep
                    // them on the character object so exports can write them back unchanged.
                    const PRESERVED_CARD_FIELDS = [
                        'mes_example',
                        'system_prompt',
                        'post_history_instructions',
                        'alternate_greetings',
                        'tags',
                        'creator',
                        'character_version',
                        'spec',
                        'spec_version'
                    ];
                    const collectPreservedCardFields = (target) => {
                        const preserved = {};
                        if (!target || typeof target !== 'object') return preserved;
                        for (const field of PRESERVED_CARD_FIELDS) {
                            const value = target[field];
                            if (value === undefined || value === null || value === '') continue;
                            if (Array.isArray(value)) {
                                if (value.length) preserved[field] = JSON.parse(JSON.stringify(value));
                            } else if (typeof value === 'object') {
                                preserved[field] = JSON.parse(JSON.stringify(value));
                            } else {
                                preserved[field] = value;
                            }
                        }
                        if (target.extensions && typeof target.extensions === 'object') {
                            const foreign = {};
                            Object.entries(target.extensions).forEach(([key, value]) => {
                                if (['regex_scripts', 'rp_hub_ui_templates', 'ui_templates', 'rp_hub_watermark'].includes(key)) return;
                                if (value === undefined || value === null) return;
                                foreign[key] = typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
                            });
                            if (Object.keys(foreign).length) preserved.rawExtensions = foreign;
                        }
                        return preserved;
                    };
                    const preservedCardFields = {
                        ...collectPreservedCardFields(rawData),
                        ...collectPreservedCardFields(rawData.data),
                        ...collectPreservedCardFields(charData)
                    };

                    // --- Extract Core Character Fields ---
                    // External cards may use specific field names. We map them to our internal structure.
                    // Priority: V2 fields > V1 fields > Fallbacks

                    const name = charData.name || charData.char_name || 'Unknown';
                    const description = charData.description || charData.char_persona || '';
                    const personality = charData.personality || '';
                    const first_mes = charData.first_mes || '';
                    const creator_notes = charData.creator_notes || charData.creatorcomment || charData.creator_comment || '';

                    // --- Extract World Info (Character Book) ---
                    // In V2, this is explicitly 'character_book'
                    if (charData.character_book) {
                        characterBook = charData.character_book;
                    }
                    // Fallback for V1 or loose JSONs
                    else if (rawData.character_book) {
                        characterBook = rawData.character_book;
                    }

                    // --- Extract Regex Scripts ---
                    // In V2-compatible cards, regex scripts are often in 'extensions.regex_scripts'
                    if (charData.extensions && charData.extensions.regex_scripts) {
                        regexScripts = charData.extensions.regex_scripts;
                    }
                    // Check root extensions as fallback
                    else if (rawData.extensions && rawData.extensions.regex_scripts) {
                        regexScripts = rawData.extensions.regex_scripts;
                    }
                    // Direct legacy keys
                    else if (charData.regex_scripts || rawData.regex_scripts) {
                        regexScripts = charData.regex_scripts || rawData.regex_scripts;
                    }

                    uiTemplates = charData.uiTemplates
                        || charData.ui_templates
                        || rawData.uiTemplates
                        || rawData.ui_templates
                        || charData.extensions?.ui_templates
                        || charData.extensions?.rp_hub_ui_templates
                        || rawData.extensions?.ui_templates
                        || rawData.extensions?.rp_hub_ui_templates
                        || null;

                    const char = {
                        name,
                        description,
                        first_mes,
                        avatar: avatarUrl || defaultAvatar,
                        personality,
                        creator_notes,
                        mes_example: preservedCardFields.mes_example || '',
                        system_prompt: preservedCardFields.system_prompt || '',
                        post_history_instructions: preservedCardFields.post_history_instructions || '',
                        alternate_greetings: Array.isArray(preservedCardFields.alternate_greetings) ? preservedCardFields.alternate_greetings : [],
                        tags: Array.isArray(preservedCardFields.tags) ? preservedCardFields.tags : [],
                        creator: preservedCardFields.creator || '',
                        character_version: preservedCardFields.character_version || '',
                        spec: preservedCardFields.spec || '',
                        spec_version: preservedCardFields.spec_version || '',
                        rawExtensions: preservedCardFields.rawExtensions || undefined,
                        worldInfo: [],
                        regexScripts: [],
                        uiTemplates: Array.isArray(uiTemplates) ? uiTemplates.map(t => normalizeUiTemplate({ ...sanitizeUiTemplateImportEntry(t), id: generateUUID(), scope: 'character' })) : [],
                        recentGenerationTimes: [],
                        uuid: generateUUID(),
                        createdAt: Date.now()
                    };

                    // --- Process World Info Entries ---
                    let entries = [];
                    if (characterBook) {
                        if (Array.isArray(characterBook.entries)) {
                            entries = characterBook.entries;
                        } else if (typeof characterBook.entries === 'object' && characterBook.entries !== null) {
                            // Handle object-based entries from some exports (like the user's file)
                            entries = Object.values(characterBook.entries);
                        } else if (Array.isArray(characterBook)) {
                            // Legacy array format
                            entries = characterBook;
                        }
                    }

                    if (entries.length > 0) {
                        char.worldInfo = entries
                            .map(entry => normalizeWorldInfoEntry({ ...entry, scope: 'character' }))
                            .filter(entry => entry.scope !== 'global');
                        console.log(`Imported and normalized ${char.worldInfo.length} World Info entries.`);
                    }

                    // --- Process Regex Scripts ---
                    if (Array.isArray(regexScripts)) {
                        char.regexScripts = regexScripts.map(script => {
                            // Preserve ALL original external fields completely
                            const normalized = {
                                ...script, // Keep all original fields intact
                            };

                            // Add normalized fields ONLY if they don't exist
                            // Common external fields: scriptName, findRegex, replaceString, trimStrings,
                            // disabled, markdownOnly, promptOnly, runOnEdit, substituteRegex
                            if (!normalized.name && script.scriptName) {
                                normalized.name = script.scriptName;
                            }
                            if (!normalized.name) {
                                normalized.name = 'Regex Script';
                            }

                            // Keep both findRegex (external standard) and regex (legacy)
                            if (!normalized.regex && script.findRegex) {
                                normalized.regex = script.findRegex;
                            }
                            if (!normalized.regex) {
                                normalized.regex = '';
                            }

                            // Parse /pattern/flags format if present
                            if (normalized.regex.startsWith('/') && normalized.regex.lastIndexOf('/') > 0) {
                                const lastSlash = normalized.regex.lastIndexOf('/');
                                const potentialFlags = normalized.regex.substring(lastSlash + 1);
                                // Simple flags validation
                                if (/^[gimsuy]*$/.test(potentialFlags)) {
                                    normalized.flags = potentialFlags;
                                    normalized.regex = normalized.regex.substring(1, lastSlash);
                                }
                            }

                            // Keep both replaceString (external standard) and replacement (legacy)
                            if (!normalized.replacement && script.replaceString) {
                                normalized.replacement = script.replaceString;
                            }

                            // Preserve flags (if not already set by parsing)
                            if (!normalized.flags && script.regexFlags) {
                                normalized.flags = script.regexFlags;
                            }
                            if (!normalized.flags) {
                                normalized.flags = 'g';
                            }

                            // CRITICAL: Convert ST's 'disabled' field to 'enabled'
                            // ST uses: disabled=true (禁用), disabled=false/undefined (启用)
                            // We use: enabled=true (启用), enabled=false (禁用)
                            if (!normalized.hasOwnProperty('enabled')) {
                                // If script has 'disabled' field, use it; otherwise default to enabled
                                normalized.enabled = script.hasOwnProperty('disabled') ? !script.disabled : true;
                            }

                            // New Fields
                            if (!normalized.placement) normalized.placement = script.placement || [1, 2];
                            if (normalized.markdownOnly === undefined) normalized.markdownOnly = script.markdownOnly || false;
                            if (normalized.promptOnly === undefined) normalized.promptOnly = script.promptOnly || false;
                            if (normalized.runOnEdit === undefined) normalized.runOnEdit = script.runOnEdit || false;
                            if (normalized.minDepth === undefined) normalized.minDepth = script.minDepth || null;
                            if (normalized.maxDepth === undefined) normalized.maxDepth = script.maxDepth || null;

                            return normalizeRegexScript({ ...normalized, scope: 'character' }, 'character');
                        }).filter(script => script.scope !== 'global');
                    }

                    characters.value.push(char);

                    // Auto-select the new character and enter chat immediately.
                    const newCharacterIndex = characters.value.length - 1;
                    showAddCharacterMenu.value = false;
                    await selectCharacter(newCharacterIndex, true);

                } catch (err) {
                    console.error("Character processing error:", err);
                    showToast('解析角色数据失败: ' + err.message, 'error');
                }
            };

            if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        await processCharacterData(data, null);
                    } catch (err) {
                        showToast('JSON解析失败: ' + err.message, 'error');
                    }
                };
                reader.readAsText(file);
            } else if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const buffer = e.target.result;
                        const { data } = cardUtils.parsePngCharacterData(buffer);
                        const blob = new Blob([buffer], { type: 'image/png' });
                        const avatarUrl = await cardUtils.blobToDataUrl(blob);
                        await processCharacterData(data, avatarUrl);
                    } catch (err) {
                        if (err.chunks) console.warn("Available chunks:", Object.keys(err.chunks));
                        console.error(err);
                        showToast('PNG解析失败: ' + err.message, 'error');
                    }
                };
                reader.readAsArrayBuffer(file);
            } else if (file.name.toLowerCase().endsWith('.jsonl') || file.type === 'application/x-ndjson' || file.type === 'application/jsonl') {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const text = e.target.result;
                        const rawLines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
                        const importedChat = [];
                        let invalidCount = 0;
                        for (const rawLine of rawLines) {
                            try {
                                const parsed = JSON.parse(rawLine);
                                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
                                const role = String(parsed.role || '').trim();
                                const content = parsed.content;
                                if (!role || typeof content !== 'string') throw new Error('missing role/content');
                                importedChat.push({ ...parsed, role, content });
                            } catch (_) {
                                invalidCount++;
                            }
                        }

                        if (importedChat.length === 0) {
                            showToast(invalidCount > 0 ? '文件中没有有效的聊天记录（存在格式错误）' : '文件中没有聊天记录', 'warning');
                            return;
                        }
                        if (currentCharacterIndex.value < 0) {
                            showToast('请先选择一个角色才能导入聊天记录', 'warning');
                            return;
                        }

                        const char = characters.value[currentCharacterIndex.value];
                        chatImportDialog.value = {
                            characterName: char.name || '未命名角色',
                            totalCount: rawLines.length,
                            validCount: importedChat.length,
                            invalidCount,
                            apply: async (mode) => {
                                try {
                                    if (mode === 'append') {
                                        chatHistory.value = [...chatHistory.value, ...importedChat];
                                    } else {
                                        chatHistory.value = [...importedChat];
                                    }
                                    if (char.uuid) {
                                        await setScopedStoredValue('chat', getCurrentStoryBranchScopeId() || char.uuid, chatHistory.value);
                                    } else {
                                        await setScopedStoredValue('chat', currentCharacterIndex.value, chatHistory.value);
                                    }
                                    const modeLabel = mode === 'append' ? '追加' : '覆盖';
                                    showToast('已' + modeLabel + ' ' + importedChat.length + ' 条聊天记录到 ' + char.name, 'success');
                                } catch (err) {
                                    console.error('Chat import save error:', err);
                                    showToast('聊天记录保存失败: ' + err.message, 'error');
                                }
                            }
                        };
                        showChatImportDialog.value = true;
                    } catch (err) {
                        console.error('Chat import error:', err);
                        showToast('聊天记录解析失败: ' + err.message, 'error');
                    }
                };
                reader.readAsText(file);
            } else {
                showToast('不支持的文件格式', 'error');
            }
        };

        const buildCharacterExportData = (char) => cardUtils.buildCharacterCardData(char, {
            worldInfoMapper: (entry) => toWorldInfoExportEntry({ ...entry, scope: 'character' }),
            uiTemplateMapper: (template) => toUiTemplateExportEntry({ ...template, scope: 'character' }),
            regexScriptMapper: (script) => toRegexExportEntry({ ...script, scope: 'character' }, 'character')
        });

        const exportCharacterJson = async (index) => {
            const char = characters.value[index];
            if (!char) return;

            try {
                const v2Data = buildCharacterExportData(char);
                const blob = new Blob([JSON.stringify(v2Data, null, 2)], { type: 'application/json' });
                const result = await cardUtils.downloadBlob(blob, (char.name || 'character') + '.json');
                if (result.saved) showToast('角色卡 JSON 导出成功', 'success');
            } catch (e) {
                console.error('JSON export error:', e);
                showToast('JSON 导出失败: ' + e.message, 'error');
            }
        };

        const exportCharacterChat = async (index) => {
            const char = characters.value[index];
            if (!char) return;

            try {
                let savedChat = null;
                if (char.uuid) {
                    savedChat = await getScopedStoredValue('chat', getStoryBranchScopeId(char.uuid, activeStoryBranchId.value));
                }
                if (!savedChat) {
                    savedChat = await getScopedStoredValue('chat', index);
                }

                if (savedChat && Array.isArray(savedChat) && savedChat.length > 0) {
                    const chatLines = savedChat.map(msg => JSON.stringify(msg)).join('\n');
                    const chatBlob = new Blob([chatLines], { type: 'application/x-ndjson' });
                    const result = await cardUtils.downloadBlob(chatBlob, (char.name || 'character') + '_chat.jsonl');
                    if (result.saved) showToast('聊天记录导出成功', 'success');
                } else {
                    showToast('当前角色没有可导出的聊天记录', 'warning');
                }
            } catch (chatExpError) {
                console.error('Chat export error:', chatExpError);
                showToast('聊天记录导出失败', 'error');
            }
        };

        const exportCharacterPng = async (index) => {
            const char = characters.value[index];
            if (!char) return;

            try {
                const v2Data = buildCharacterExportData(char);
                const pngBytes = await cardUtils.imageUrlToPngBytes(char.avatar, { crossOrigin: "Anonymous" });
                const finalPng = cardUtils.injectPngTextChunk(
                    pngBytes,
                    'chara',
                    cardUtils.encodeBase64Utf8(JSON.stringify(v2Data))
                );
                const result = await cardUtils.downloadBlob(new Blob([finalPng], { type: 'image/png' }), (char.name || 'character') + '.png');
                if (result.saved) showToast('角色卡 PNG 导出成功', 'success');
            } catch (e) {
                console.error('PNG export error:', e);
                showToast('PNG 导出失败: ' + e.message, 'error');
            }
        };


const openExportModal = (type) => {
                exportType.value = type;
                selectedExportIndices.value.clear();

                if (type === 'presets') {
                    exportItems.value = presets.value;
                } else if (type === 'regex') {
                    exportItems.value = regexScripts.value;
                } else if (type === 'worldinfo') {
                    exportItems.value = worldInfo.value;
                } else if (type === 'uitemplates') {
                    exportItems.value = currentUiTemplates.value;
                }

                showExportModal.value = true;
            };

const toggleExportSelection = (index) => {
                if (selectedExportIndices.value.has(index)) {
                    selectedExportIndices.value.delete(index);
                } else {
                    selectedExportIndices.value.add(index);
                }
            };

const selectAllExportItems = () => {
                exportItems.value.forEach((_, index) => selectedExportIndices.value.add(index));
            };

const deselectAllExportItems = () => {
                selectedExportIndices.value.clear();
            };

const confirmExport = async () => {
                const indices = Array.from(selectedExportIndices.value).sort((a, b) => a - b);
                const items = indices.map(i => exportItems.value[i]);

                if (items.length === 0) return;

                let fileName = 'export.json';
                let dataToExport = items;

                if (exportType.value === 'presets') {
                    fileName = 'presets.json';
                    // Presets are exported as a direct array of objects
                } else if (exportType.value === 'regex') {
                    fileName = 'regex_scripts.json';
                    dataToExport = items.map(script => toRegexExportEntry(script));
                } else if (exportType.value === 'worldinfo') {
                    fileName = 'world_info.json';
                    // World Info should be wrapped in entries object
                    dataToExport = { entries: items.map(toWorldInfoExportEntry) };
                } else if (exportType.value === 'uitemplates') {
                    fileName = `${currentCharacter.value?.name || 'global'}_ui_templates.json`;
                    dataToExport = {
                        type: 'rp-hub-ui-templates',
                        templates: items.map(toUiTemplateExportEntry)
                    };
                }

                try {
                    const { result } = await downloadJsonFile(dataToExport, fileName);
                    if (result.saved) {
                        showExportModal.value = false;
                        showToast(`成功导出 ${items.length} 个项目`, 'success');
                    }
                } catch (error) {
                    console.error('Export failed:', error);
                    showToast('导出失败: ' + (error?.message || error), 'error');
                }
            };

const importPresets = (event) => readJsonFileInput(event, data => {
                const items = Array.isArray(data) ? data : [data];
                const normalized = items.map(normalizePreset);
                const existing = new Set(presets.value.map(p => importItemFingerprint(p, ['role', 'content'])));
                const newItems = [];
                let duplicateCount = 0;
                let invalidCount = 0;
                normalized.forEach(item => {
                    if (!String(item.content || '').trim()) { invalidCount++; return; }
                    const fingerprint = importItemFingerprint(item, ['role', 'content']);
                    if (existing.has(fingerprint)) { duplicateCount++; return; }
                    existing.add(fingerprint);
                    newItems.push(item);
                });
                if (newItems.length === 0) {
                    showToast(`没有需要导入的预设（重复 ${duplicateCount} 条${invalidCount ? `，无效 ${invalidCount} 条` : ''}）`, 'warning');
                    return;
                }
                importPreview.value = {
                    title: '导入预设',
                    itemLabel: '预设',
                    totalCount: normalized.length,
                    newCount: newItems.length,
                    duplicateCount,
                    invalidCount,
                    apply: async () => {
                        presets.value = [...presets.value, ...newItems];
                        await saveData();
                        showToast(`成功导入 ${newItems.length} 条预设${duplicateCount ? `，跳过 ${duplicateCount} 条重复` : ''}`, 'success');
                    }
                };
                showImportPreview.value = true;
            }, () => showToast('导入失败: 格式错误', 'error'));

            // Regex Methods

const importRegex = (event) => readJsonFileInput(event, data => {
                const items = Array.isArray(data) ? data : [data];
                const normalized = items.map(script => {
                    const s = { ...script };
                    s.scope = s.scope || (currentCharacter.value ? 'character' : 'global');
                    if (s.disabled !== undefined) {
                        s.enabled = !s.disabled;
                    } else if (s.enabled === undefined) {
                        s.enabled = true;
                    }
                    if (!s.name && s.scriptName) s.name = s.scriptName;
                    if (!s.regex && s.findRegex) s.regex = s.findRegex;

                    if (s.regex && s.regex.startsWith('/') && s.regex.lastIndexOf('/') > 0) {
                        const lastSlash = s.regex.lastIndexOf('/');
                        const potentialFlags = s.regex.substring(lastSlash + 1);
                        if (/^[gimsuy]*$/.test(potentialFlags)) {
                            s.flags = potentialFlags;
                            s.regex = s.regex.substring(1, lastSlash);
                        }
                    }

                    if (!s.replacement && s.replaceString) s.replacement = s.replaceString;
                    if (!s.flags && s.regexFlags) s.flags = s.regexFlags;
                    if (!s.flags) s.flags = 'g';
                    if (!s.placement) s.placement = [1, 2];
                    if (s.markdownOnly === undefined) s.markdownOnly = false;
                    if (s.promptOnly === undefined) s.promptOnly = false;
                    if (s.runOnEdit === undefined) s.runOnEdit = false;
                    if (s.minDepth === undefined) s.minDepth = null;
                    if (s.maxDepth === undefined) s.maxDepth = null;

                    return normalizeRegexScript(s, s.scope);
                });

                const existing = new Set(regexScripts.value.map(script => importItemFingerprint(script, ['name', 'regex', 'flags', 'replacement'])));
                const newItems = [];
                let duplicateCount = 0;
                let invalidCount = 0;
                normalized.forEach(script => {
                    if (!String(script.regex || '').trim()) { invalidCount++; return; }
                    const fingerprint = importItemFingerprint(script, ['name', 'regex', 'flags', 'replacement']);
                    if (existing.has(fingerprint)) { duplicateCount++; return; }
                    existing.add(fingerprint);
                    newItems.push(script);
                });

                if (newItems.length === 0) {
                    showToast(`没有需要导入的正则脚本（重复 ${duplicateCount} 条${invalidCount ? `，无效 ${invalidCount} 条` : ''}）`, 'warning');
                    return;
                }
                importPreview.value = {
                    title: '导入正则脚本',
                    itemLabel: '正则脚本',
                    totalCount: normalized.length,
                    newCount: newItems.length,
                    duplicateCount,
                    invalidCount,
                    apply: async () => {
                        regexScripts.value = [...regexScripts.value, ...newItems];
                        await saveData();
                        showToast(`成功导入 ${newItems.length} 个正则脚本${duplicateCount ? `，跳过 ${duplicateCount} 条重复` : ''}`, 'success');
                    }
                };
                showImportPreview.value = true;
            }, error => showToast(`导入失败: ${error.message}`, 'error'));

const importWorldInfo = (event) => readJsonFileInput(event, data => {
                let entries = [];
                if (Array.isArray(data)) {
                    entries = data;
                } else if (Array.isArray(data?.entries)) {
                    entries = data.entries;
                } else if (data?.entries && typeof data.entries === 'object') {
                    entries = Object.values(data.entries);
                }
                const normalized = entries.map(normalizeWorldInfoEntry);
                if (normalized.length === 0) {
                    showToast('文件中没有世界书条目', 'warning');
                    return;
                }
                const existing = new Set(worldInfo.value.map(entry => importItemFingerprint(entry, ['keys', 'content'])));
                const newItems = [];
                let duplicateCount = 0;
                let invalidCount = 0;
                normalized.forEach(entry => {
                    if (!String(entry.content || '').trim()) { invalidCount++; return; }
                    const fingerprint = importItemFingerprint(entry, ['keys', 'content']);
                    if (existing.has(fingerprint)) { duplicateCount++; return; }
                    existing.add(fingerprint);
                    newItems.push(entry);
                });
                if (newItems.length === 0) {
                    showToast(`没有需要导入的世界书条目（重复 ${duplicateCount} 条${invalidCount ? `，无效 ${invalidCount} 条` : ''}）`, 'warning');
                    return;
                }
                importPreview.value = {
                    title: '导入世界书',
                    itemLabel: '世界书条目',
                    totalCount: normalized.length,
                    newCount: newItems.length,
                    duplicateCount,
                    invalidCount,
                    apply: async () => {
                        worldInfo.value = [...worldInfo.value, ...newItems];
                        if (currentCharacterIndex.value !== -1) {
                            characters.value[currentCharacterIndex.value].worldInfo = JSON.parse(JSON.stringify(worldInfo.value));
                        }
                        await saveData();
                        showToast(`成功导入 ${newItems.length} 个世界书条目${duplicateCount ? `，跳过 ${duplicateCount} 条重复` : ''}`, 'success');
                    }
                };
                showImportPreview.value = true;
            }, () => showToast('导入失败: 格式错误', 'error'));

    return {
        showExportModal, exportType, exportItems, selectedExportIndices,
        showChatImportDialog, chatImportDialog, showImportPreview, importPreview,
        openCharacterExportModal, confirmCharacterExport,
        confirmChatImportOverwrite, confirmChatImportAppend, cancelChatImport,
        confirmImportPreview, cancelImportPreview,
        toRegexExportEntry, toUiTemplateExportEntry, sanitizeUiTemplateImportEntry, toWorldInfoExportEntry,
        downloadJsonFile, stableJsonStringify, importItemFingerprint, readJsonFileInput, importUiTemplates,
        importCharacter, buildCharacterExportData, exportCharacterJson, exportCharacterChat, exportCharacterPng,
        openExportModal, toggleExportSelection, selectAllExportItems, deselectAllExportItems, confirmExport,
        importPresets, importRegex, importWorldInfo
    };
}
