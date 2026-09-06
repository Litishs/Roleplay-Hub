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
        imageModelOptions,
        imageSizeOptions,
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

                // Phase 4.3 startup optimization: all storage reads are
                // independent (literal keys, no read depends on another read's
                // result), so they are issued as one parallel batch instead of
                // ~19 sequential IndexedDB round-trips. The synchronous
                // processing below keeps the original sequential order and is
                // semantically identical to the previous per-key awaits.
                const [
                    savedChars,
                    savedSettings,
                    savedPresets,
                    savedPresetGroups,
                    savedPresetVersion,
                    savedDeletedDefaultPresets,
                    savedGlobalRegex,
                    savedRegex,
                    savedGlobalWI,
                    savedWI,
                    savedGlobalUiTemplates,
                    savedActiveTools,
                    savedWISettings,
                    savedUser,
                    savedProfiles,
                    savedActiveId,
                    lastCharIndex,
                    savedMemorySettings,
                    savedTokenUsageHistory
                ] = await Promise.all([
                    getStoredValue('characters'),
                    getStoredValue('settings'),
                    getStoredValue('presets'),
                    getStoredValue('preset_groups'),
                    getStoredValue('preset_definitions_version'),
                    getStoredValue('deleted_default_presets'),
                    getStoredValue('global_regex'),
                    getStoredValue('regex'),
                    getStoredValue('global_worldinfo'),
                    getStoredValue('worldinfo'),
                    getStoredValue('global_ui_templates'),
                    getStoredValue('active_tools'),
                    getStoredValue('worldinfo_settings'),
                    getStoredValue('user'),
                    getStoredValue('user_profiles'),
                    getStoredValue('active_profile_id'),
                    getStoredValue('last_active_char'),
                    getStoredValue('memory_settings'),
                    getStoredValue('token_usage_history')
                ]);

                // Load from DB
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
                // One-time migration (2026-09-06): quick-settings slots gained
                // per-slot provider bindings.  Slots saved by older builds hold
                // bare model names that would silently switch the model without
                // switching the chat provider, so wipe them once — API
                // connection data (urls/keys/provider ids) is untouched — and
                // let users rebind through the model picker, which records the
                // provider from the start.
                if (Number(savedSettings?.slotProviderBindingVersion || 0) < 1) {
                    settings.model = '';
                    settings.qualityModel = '';
                    settings.balancedModel = '';
                    settings.fastModel = '';
                    settings.qualityModelProvider = '';
                    settings.balancedModelProvider = '';
                    settings.fastModelProvider = '';
                }
                settings.slotProviderBindingVersion = 1;
                settings.fontFamily = normalizeFontFamily(settings.fontFamily);
                // Image-gen settings normalization (upstream STA1N parity):
                // unknown 生图版本 falls back to V4.5; legacy composite sizes
                // (2K竖图 / 4K方图 …) collapse to 竖图/横图/方图; count clamps to 2..8.
                if (!imageModelOptions.some(option => option.value === settings.imageModel)) {
                    settings.imageModel = imageModelOptions[0].value;
                }
                if (!imageSizeOptions.some(option => option.value === settings.imageSize)) {
                    const legacySize = String(settings.imageSize || '');
                    settings.imageSize = legacySize.includes('横') ? '横图' : legacySize.includes('方') ? '方图' : '竖图';
                }
                settings.imageGenCount = Math.min(8, Math.max(2, Math.round(Number(settings.imageGenCount) || 2)));
                settings.fontFamilyVersion = 4;
                applyFontFamily(settings.fontFamily);
                delete settings.renderLayerLimit;
                settings.contextSize = MAX_CONTEXT_SIZE;
                settings.stream = true;
                normalizeActiveToolAggressivenessSettings();
                syncChatModelFromPresets();

                if (savedPresets) presets.value = savedPresets.map(normalizePreset);

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

                if (typeof savedPresetVersion === 'number') {
                    presetDefinitionsVersionApplied.value = savedPresetVersion;
                }

                if (Array.isArray(savedDeletedDefaultPresets)) {
                    deletedDefaultPresetNames.value = savedDeletedDefaultPresets.filter(name => typeof name === 'string');
                }

                if (savedGlobalRegex) globalRegexScripts.value = savedGlobalRegex.map(script => normalizeRegexScript(script, 'global'));

                if (savedGlobalRegex) {
                    regexScripts.value = JSON.parse(JSON.stringify(globalRegexScripts.value)).map(script => normalizeRegexScript(script, 'global'));
                } else if (savedRegex) {
                    regexScripts.value = savedRegex.map(script => normalizeRegexScript(script, 'character'));
                }

                if (savedGlobalWI) globalWorldInfo.value = savedGlobalWI.map(entry => normalizeWorldInfoEntry({ ...entry, scope: 'global' }));

                if (savedGlobalWI) {
                    worldInfo.value = JSON.parse(JSON.stringify(globalWorldInfo.value)).map(entry => normalizeWorldInfoEntry({ ...entry, scope: 'global' }));
                } else if (savedWI) {
                    worldInfo.value = savedWI.map(normalizeWorldInfoEntry);
                }

                if (savedGlobalUiTemplates) globalUiTemplates.value = savedGlobalUiTemplates.map(template => normalizeUiTemplate({ ...template, scope: 'global' }));

                normalizeActiveTools(savedActiveTools || activeTools.value);

                if (savedWISettings) {
                    ['scanDepth', 'maxDepth'].forEach(key => {
                        if (savedWISettings[key] !== undefined) worldInfoSettings[key] = savedWISettings[key];
                    });
                }

                // const savedRecentTimes = await getStoredValue('recent_times'); // Deprecated
                // if (savedRecentTimes) recentGenerationTimes.value = savedRecentTimes;

                if (savedUser) Object.assign(user, savedUser);
                if (!user.uuid) user.uuid = generateUUID(); // Ensure UUID

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
                if (lastCharIndex !== undefined) {
                    lastActiveCharacterId.value = lastCharIndex;
                }

                // Load Memory Settings
                if (savedMemorySettings) Object.assign(memorySettings, savedMemorySettings);
                normalizeMemorySettings();

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
