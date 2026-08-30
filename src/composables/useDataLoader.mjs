// useDataLoader — startup data load / migration (Phase 3.0, roadmap 3.0)
//
// Owns loadData, previously inlined in app.mjs setup(): opens the database
// and restores characters (with the UUID/createdAt/scenario/UI-template/
// worldinfo/regex migrations), settings (legacy apiProviderId resolution,
// font family migration), presets, regex scripts, world info, global UI
// templates, active tools, user + profiles, memory settings and token usage
// history. The moved code is byte-identical to the app.mjs original except
// for the failure guard: _dataLoadFailed stays in the app.mjs binding
// (saveData reads it) and is flipped through setDataLoadFailed — same
// shared-guard bridge pattern as useCardOperations.setApplyingCharacterScopedData.
//
// Pattern contract (deps-injecting logic factory, see useMessageSender.mjs):
// - app.mjs destructures { loadData } right after normalizeCharacterUiTemplates
//   (the last dep definition; the original loadData declaration site sat
//   before several normalize helpers). loadData itself is only invoked from
//   onMounted, so the late wiring is safe.
// - generateUUID comes from utils.mjs (module import); everything else is a dep.
// Contract locks: tests/composables-contract.test.mjs.

import { generateUUID } from '../modules/utils.mjs';

export function useDataLoader(deps) {
    const {
        // storage layer
        initDB,
        getStoredValue,
        setStoredValue,
        getScopedStoredValue,
        setScopedStoredValue,
        deleteScopedStoredValue,
        // domain state
        characters,
        settings,
        presets,
        presetGroups,
        presetDefinitionsVersionApplied,
        deletedDefaultPresetNames,
        globalRegexScripts,
        regexScripts,
        globalWorldInfo,
        worldInfo,
        worldInfoSettings,
        globalUiTemplates,
        activeTools,
        user,
        userProfiles,
        activeProfileId,
        lastActiveCharacterId,
        memorySettings,
        tokenUsageHistory,
        // settings / provider constants + resolvers
        DEFAULT_API_PROVIDER_ID,
        MAX_CONTEXT_SIZE,
        getApiProviderByUrl,
        normalizeApiProviderSettings,
        normalizeFontFamily,
        applyFontFamily,
        syncChatModelFromPresets,
        normalizeActiveToolAggressivenessSettings,
        // normalizers
        normalizePreset,
        normalizeRegexScript,
        normalizeWorldInfoEntry,
        normalizeUiTemplate,
        normalizeActiveTools,
        normalizeCharacterUiTemplates,
        normalizeMemorySettings,
        // shared guard bridge + toast
        setDataLoadFailed,
        showToast
    } = deps;

    const loadData = async () => {
        try {
                await initDB();

                // Load from DB
                const savedChars = await getStoredValue('characters');
                if (savedChars) {
                    // Migration: Ensure all characters have a UUID and createdAt
                    let migrated = false;
                    characters.value = savedChars.filter(char => char).map((char, index) => {
                        if (!char.uuid) {
                            char.uuid = generateUUID();
                            migrated = true;
                            // Try to migrate old index-based chat history to UUID-based
                            getScopedStoredValue('chat', index).then(oldChat => {
                                if (oldChat) {
                                    setScopedStoredValue('chat', char.uuid, oldChat);
                                    deleteScopedStoredValue('chat', index); // Clean up old key
                                }
                            }).catch(() => { });
                        }
                        if (!char.createdAt) {
                            // Use a slightly offset timestamp based on index to preserve some order for old cards
                            char.createdAt = Date.now() - (savedChars.length - index) * 1000;
                            migrated = true;
                        }
                        if (Object.prototype.hasOwnProperty.call(char, 'scenario')) {
                            delete char.scenario;
                            migrated = true;
                        }
                        if (Array.isArray(char.worldInfo)) {
                            char.worldInfo = char.worldInfo.map(normalizeWorldInfoEntry).filter(entry => entry.scope !== 'global');
                        }
                        if (Array.isArray(char.regexScripts)) {
                            char.regexScripts = char.regexScripts.map(script => normalizeRegexScript(script, 'character')).filter(script => script.scope !== 'global');
                        }
                        normalizeCharacterUiTemplates(char);
                        return char;
                    });
                    if (migrated) {
                        await setStoredValue('characters', characters.value);
                        console.log('Migrated characters to UUID and timestamp system');
                    }
                }

                const savedSettings = await getStoredValue('settings');
                if (savedSettings) {
                    Object.keys(savedSettings).forEach(key => {
                        if (Object.prototype.hasOwnProperty.call(settings, key)) {
                            settings[key] = savedSettings[key];
                        }
                    });
                    if (!Object.prototype.hasOwnProperty.call(savedSettings, 'apiProviderId')) {
                        const legacyProvider = getApiProviderByUrl(savedSettings.apiUrl);
                        settings.apiProviderId = legacyProvider?.id || (savedSettings.apiUrl ? 'custom' : DEFAULT_API_PROVIDER_ID);
                        if (!legacyProvider && savedSettings.apiUrl) settings.customApiUrl = savedSettings.apiUrl;
                    }
                    normalizeApiProviderSettings();
                } else {
                    normalizeApiProviderSettings();
                }
                if ((!savedSettings || Number(savedSettings.fontFamilyVersion || 0) < 4) && settings.fontFamily === 'serif') {
                    settings.fontFamily = 'modern';
                }
                settings.fontFamily = normalizeFontFamily(settings.fontFamily);
                settings.fontFamilyVersion = 4;
                applyFontFamily(settings.fontFamily);
                delete settings.renderLayerLimit;
                settings.contextSize = MAX_CONTEXT_SIZE;
                settings.stream = true;
                normalizeActiveToolAggressivenessSettings();
                syncChatModelFromPresets();

                const savedPresets = await getStoredValue('presets');
                if (savedPresets) presets.value = savedPresets.map(normalizePreset);

                const savedPresetGroups = await getStoredValue('preset_groups');
                if (Array.isArray(savedPresetGroups) && savedPresetGroups.length > 0) {
                    presetGroups.value = savedPresetGroups
                        .filter(g => g && typeof g.id === 'string' && g.id)
                        .map(g => ({
                            id: g.id,
                            name: g.name || (g.id === 'default' ? '默认预设' : g.id),
                            builtin: g.id === 'default' ? true : !!g.builtin,
                            enabled: g.id === 'default' ? (g.enabled !== false) : (g.enabled === true)
                        }));
                }

                const savedPresetVersion = await getStoredValue('preset_definitions_version');
                if (typeof savedPresetVersion === 'number') {
                    presetDefinitionsVersionApplied.value = savedPresetVersion;
                }

                const savedDeletedDefaultPresets = await getStoredValue('deleted_default_presets');
                if (Array.isArray(savedDeletedDefaultPresets)) {
                    deletedDefaultPresetNames.value = savedDeletedDefaultPresets.filter(name => typeof name === 'string');
                }

                const savedGlobalRegex = await getStoredValue('global_regex');
                if (savedGlobalRegex) globalRegexScripts.value = savedGlobalRegex.map(script => normalizeRegexScript(script, 'global'));

                const savedRegex = await getStoredValue('regex');
                if (savedGlobalRegex) {
                    regexScripts.value = JSON.parse(JSON.stringify(globalRegexScripts.value)).map(script => normalizeRegexScript(script, 'global'));
                } else if (savedRegex) {
                    regexScripts.value = savedRegex.map(script => normalizeRegexScript(script, 'character'));
                }

                const savedGlobalWI = await getStoredValue('global_worldinfo');
                if (savedGlobalWI) globalWorldInfo.value = savedGlobalWI.map(entry => normalizeWorldInfoEntry({ ...entry, scope: 'global' }));

                const savedWI = await getStoredValue('worldinfo');
                if (savedGlobalWI) {
                    worldInfo.value = JSON.parse(JSON.stringify(globalWorldInfo.value)).map(entry => normalizeWorldInfoEntry({ ...entry, scope: 'global' }));
                } else if (savedWI) {
                    worldInfo.value = savedWI.map(normalizeWorldInfoEntry);
                }

                const savedGlobalUiTemplates = await getStoredValue('global_ui_templates');
                if (savedGlobalUiTemplates) globalUiTemplates.value = savedGlobalUiTemplates.map(template => normalizeUiTemplate({ ...template, scope: 'global' }));

                const savedActiveTools = await getStoredValue('active_tools');
                normalizeActiveTools(savedActiveTools || activeTools.value);

                const savedWISettings = await getStoredValue('worldinfo_settings');
                if (savedWISettings) {
                    ['scanDepth', 'maxDepth'].forEach(key => {
                        if (savedWISettings[key] !== undefined) worldInfoSettings[key] = savedWISettings[key];
                    });
                }

                // const savedRecentTimes = await getStoredValue('recent_times'); // Deprecated
                // if (savedRecentTimes) recentGenerationTimes.value = savedRecentTimes;

                const savedUser = await getStoredValue('user');
                if (savedUser) Object.assign(user, savedUser);
                if (!user.uuid) user.uuid = generateUUID(); // Ensure UUID

                const savedProfiles = await getStoredValue('user_profiles');
                const savedActiveId = await getStoredValue('active_profile_id');

                if (savedProfiles && savedProfiles.length > 0) {
                    userProfiles.value = savedProfiles;
                    activeProfileId.value = savedActiveId || savedProfiles[0].uuid;
                    const activeProfile = userProfiles.value.find(p => p.uuid === activeProfileId.value);
                    if (activeProfile) {
                        Object.assign(user, activeProfile);
                        if (!user.uuid) user.uuid = activeProfileId.value;
                    }
                } else {
                    // Migrate single user to profiles
                    const firstProfile = JSON.parse(JSON.stringify(user));
                    if (!firstProfile.uuid) firstProfile.uuid = generateUUID();
                    user.uuid = firstProfile.uuid;
                    userProfiles.value = [firstProfile];
                    activeProfileId.value = firstProfile.uuid;
                }

                // Load Last Active Character Index
                const lastCharIndex = await getStoredValue('last_active_char');
                if (lastCharIndex !== undefined) {
                    lastActiveCharacterId.value = lastCharIndex;
                }

                // Load Memory Settings
                const savedMemorySettings = await getStoredValue('memory_settings');
                if (savedMemorySettings) Object.assign(memorySettings, savedMemorySettings);
                normalizeMemorySettings();

                const savedTokenUsageHistory = await getStoredValue('token_usage_history');
                if (Array.isArray(savedTokenUsageHistory)) {
                    tokenUsageHistory.value = savedTokenUsageHistory
                        .filter(record => record && typeof record === 'object')
                        .map(record => ({
                            ...record,
                            cacheWriteTokens: Number.isFinite(record.cacheWriteTokens) ? record.cacheWriteTokens : 0
                        }))
                        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                }

            } catch (e) {
                console.error('Failed to load saved data', e);
                setDataLoadFailed(true); // 阻止后续 saveData 用默认空值覆盖存储中的数据
                showToast('加载保存的数据失败', 'error');
            }
    };

    return { loadData };
}
