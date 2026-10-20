
    'use strict';

    const nativePlugin = () => window.Capacitor?.Plugins?.NativeStorage || null;
    const memoryStore = new Map();
    const memoryChats = new Map();
    const memoryFragments = new Map();
    const memorySecrets = new Map();

    // Degraded backend for non-native environments (browser dev / future web
    // distribution): kv and chats persist to localStorage (per-key fallback to
    // memory on quota overflow or unavailability). Secrets are deliberately
    // excluded — plaintext-at-rest secrets are an unacceptable security
    // fallback; outside native, secrets stay session-only (memorySecrets).
    const LOCAL_STORAGE_PREFIX = 'rph_storage:';
    const localStorageAvailable = (() => {
        try { return typeof localStorage !== 'undefined' && !!localStorage; }
        catch (_) { return false; }
    })();

    const persistentStore = {
        read(key) {
            if (!localStorageAvailable) return undefined;
            return localStorage.getItem(LOCAL_STORAGE_PREFIX + key) ?? undefined;
        },
        write(key, json) {
            if (!localStorageAvailable) return false;
            try { localStorage.setItem(LOCAL_STORAGE_PREFIX + key, json); return true; }
            catch (_) { return false; }
        },
        remove(key) {
            if (!localStorageAvailable) return;
            try { localStorage.removeItem(LOCAL_STORAGE_PREFIX + key); } catch (_) {}
        }
    };

    const kvFallbackGet = (key) => persistentStore.read(key) ?? memoryStore.get(key) ?? null;
    const kvFallbackSet = (key, json) => {
        memoryStore.set(key, json);
        persistentStore.write(key, json);
    };
    const kvFallbackRemove = (key) => {
        memoryStore.delete(key);
        persistentStore.remove(key);
    };
    const chatFallbackGet = (id) => persistentStore.read(`chat:${id}`) ?? memoryChats.get(id) ?? null;
    const chatFallbackSet = (id, json) => {
        memoryChats.set(id, json);
        if (!persistentStore.write(`chat:${id}`, json)) {
            console.warn('[StorageRepository] chat too large for localStorage fallback; session-only for this scope');
        }
    };
    const chatFallbackRemove = (id) => {
        memoryChats.delete(id);
        persistentStore.remove(`chat:${id}`);
    };
    // init 并发守卫：启动期并发的 set/get 只触发一次 plugin.init()，
    // 避免原生初始化（可能含迁移逻辑）的竞态。
    let initPromise = null;
    // loadFragments/applyFragments 已删除：全仓零调用方，且
    // tests/story-branch-contract.test.mjs 明确断言 fact fragment persistence
    // "stays removed"。memoryFragments Map 保留（deleteFragments 仍在使用）。

    const failedReads = new Set();
    const arrayKeys = new Set([
        'rp_hub_characters', 'rp_hub_presets', 'rp_hub_preset_groups',
        'rp_hub_deleted_default_presets', 'rp_hub_global_regex', 'rp_hub_regex',
        'rp_hub_global_worldinfo', 'rp_hub_worldinfo', 'rp_hub_global_ui_templates',
        'rp_hub_active_tools', 'rp_hub_user_profiles', 'rp_hub_token_usage_history'
    ]);
    const objectKeys = new Set([
        'rp_hub_settings', 'rp_hub_user', 'rp_hub_worldinfo_settings',
        'rp_hub_memory_settings', 'plugin_marketplace_state', 'novel_settings'
    ]);
    const isObjectRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

    const readError = (key, code) => {
        // Parser messages can contain excerpts of secrets or conversation text.
        // Only expose the storage key and a fixed error code, never the payload.
        const error = new Error(`[StorageRepository] Invalid stored data for "${key}" (${code}); original data preserved`);
        error.name = 'StorageReadError';
        error.code = code;
        error.storageKey = String(key);
        return error;
    };

    const parseJson = (json, fallback, key = '(unknown)') => {
        if (json === null || json === undefined) return fallback;
        try { return JSON.parse(json); } catch (_) {
            throw readError(key, 'STORAGE_INVALID_JSON');
        }
    };

    const validateStoredShape = (key, value) => {
        if ((arrayKeys.has(String(key)) && !Array.isArray(value))
            || (objectKeys.has(String(key)) && !isObjectRecord(value))) {
            throw readError(key, 'STORAGE_INVALID_SHAPE');
        }
    };

    const protectedRead = async (key, read) => {
        const storageKey = String(key);
        try {
            const value = await read();
            failedReads.delete(storageKey);
            return value;
        } catch (error) {
            failedReads.add(storageKey);
            console.error(`[StorageRepository] Read failed for "${storageKey}"; writes are blocked until a successful reread`);
            throw error;
        }
    };

    const assertWritable = key => {
        const storageKey = String(key);
        if (!failedReads.has(storageKey)) return;
        const error = new Error(`[StorageRepository] Refusing to overwrite unread data for "${storageKey}"`);
        error.name = 'StorageWriteBlockedError';
        error.code = 'STORAGE_WRITE_BLOCKED';
        error.storageKey = storageKey;
        throw error;
    };

    const cloneJson = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

    const extractSecrets = value => {
        const secrets = {};
        const walk = (item, path = '') => {
            if (Array.isArray(item)) return item.map((entry, index) => walk(entry, `${path}/${index}`));
            if (!item || typeof item !== 'object') return item;
            const output = {};
            Object.entries(item).forEach(([key, entry]) => {
                const entryPath = `${path}/${key}`;
                if (/^(apiKey|imageGenKey|apiProviderKeys|tavilyApiKey|ttsCloudApiKey)$/i.test(key)) {
                    secrets[entryPath] = entry;
                    output[key] = Array.isArray(entry) ? [] : (entry && typeof entry === 'object' ? {} : '');
                } else {
                    output[key] = walk(entry, entryPath);
                }
            });
            return output;
        };
        return { publicValue: walk(cloneJson(value)), secrets };
    };

    const restoreSecrets = (value, secrets) => {
        const result = cloneJson(value);
        Object.entries(secrets || {}).forEach(([path, secret]) => {
            const parts = path.split('/').filter(Boolean);
            let target = result;
            for (let index = 0; index < parts.length - 1; index += 1) {
                if (target?.[parts[index]] === undefined) {
                    // 结构失配时密钥会被静默丢弃（用户表现为 API Key 无声消失），必须留痕。
                    console.warn(`[StorageRepository] secret path "${path}" no longer matches stored structure; value dropped`);
                    return;
                }
                target = target[parts[index]];
            }
            if (target && parts.length) target[parts[parts.length - 1]] = secret;
        });
        return result;
    };

    // Secret-bearing keys get field-level extraction (apiKey/apiProviderKeys/…)
    // into the native secret channel before the value reaches plain SQLite.
    // novel_settings (墨韵·造梦 workshop config, written through the novel
    // storage bridge) rides the same channel so page-side API keys never
    // persist in plain SQLite nor enter full backups.
    const isSecretBearingKey = key => /^(rp_hub_(settings|active_tools)|novel_settings)$/.test(String(key));

    // 密钥存储的 key 白名单：只放行 isSecretBearingKey 对应的 `config:` 前缀密钥
    // （当前仓库内合法用途见上方注释）。RPHStorage 整体挂在 window 上供卡片 iframe
    // 使用，一旦沙箱被绕过，任意 key 的密钥读取都将成为攻击面——这里把可读范围
    // 收敛到白名单。与 isSecretBearingKey 保持同一份 key 列表，新增承载 key 时两处同步。
    const assertSecretKey = (key) => {
        if (!/^config:(rp_hub_(settings|active_tools)|novel_settings)$/.test(String(key))) {
            throw new Error(`[StorageRepository] secret access denied for key "${key}"`);
        }
    };

    const repository = {
        get isNative() { return !!nativePlugin(); },

        async init() {
            if (!initPromise) {
                initPromise = (async () => {
                    const plugin = nativePlugin();
                    if (plugin) await plugin.init();
                    else console.warn('[StorageRepository] Native plugin unavailable; using localStorage-backed fallback (secrets stay session-only).');
                })();
            }
            await initPromise;
        },

        async set(key, value) {
            await this.init();
            assertWritable(key);
            if (value === undefined) {
                // JSON.stringify(undefined) === undefined，过桥后原生端只会报误导性的
                // "key and json are required"。在 JS 层提前拦下并给出准确错误。
                throw new Error(`[StorageRepository] set("${key}") rejected: value is undefined`);
            }
            let storedValue = cloneJson(value);
            if (isSecretBearingKey(key)) {
                const extracted = extractSecrets(storedValue);
                storedValue = extracted.publicValue;
                await this.setSecret(`config:${key}`, JSON.stringify(extracted.secrets));
                assertWritable(key);
            }
            const plugin = nativePlugin();
            const json = JSON.stringify(storedValue);
            if (plugin) await plugin.kvSet({ key, json });
            else kvFallbackSet(key, json);
        },

        async get(key) {
            await this.init();
            return protectedRead(key, async () => {
                const plugin = nativePlugin();
                const response = plugin ? await plugin.kvGet({ key }) : { json: kvFallbackGet(key) };
                const value = parseJson(response.json, undefined, key);
                if (value === undefined) return value;
                validateStoredShape(key, value);
                if (!isSecretBearingKey(key)) return value;
                const secrets = parseJson(await this.getSecret(`config:${key}`), {}, `secrets:${key}`);
                if (!isObjectRecord(secrets)) throw readError(`secrets:${key}`, 'STORAGE_INVALID_SHAPE');
                if (!Object.keys(secrets).length) {
                    // Public data can survive a failed or interrupted secret write.
                    console.warn(`[StorageRepository] "${key}" has public data but an empty secret store; keys may have been lost`);
                }
                return restoreSecrets(value, secrets);
            });
        },

        async remove(key) {
            await this.init();
            assertWritable(key);
            const plugin = nativePlugin();
            if (plugin) await plugin.kvRemove({ key });
            else kvFallbackRemove(key);
            if (isSecretBearingKey(key)) await this.removeSecret(`config:${key}`);
        },

        async setSecret(key, value) {
            assertSecretKey(key);
            assertWritable(String(key).replace(/^config:/, ''));
            const plugin = nativePlugin();
            if (plugin) await plugin.secretSet({ key, value: String(value ?? '') });
            else memorySecrets.set(key, String(value ?? ''));
        },

        async getSecret(key) {
            assertSecretKey(key);
            const plugin = nativePlugin();
            const response = plugin ? await plugin.secretGet({ key }) : { value: memorySecrets.get(key) ?? null };
            return response.value;
        },

        async removeSecret(key) {
            assertSecretKey(key);
            assertWritable(String(key).replace(/^config:/, ''));
            const plugin = nativePlugin();
            if (plugin) await plugin.secretRemove({ key });
            else memorySecrets.delete(key);
        },

        async loadChat(characterId) {
            await this.init();
            return protectedRead(`chat:${characterId}`, async () => {
                const plugin = nativePlugin();
                const response = plugin
                    ? await plugin.chatGet({ characterId: String(characterId) })
                    : { json: chatFallbackGet(String(characterId)) };
                const value = parseJson(response.json, [], `chat:${characterId}`);
                if (!Array.isArray(value)) throw readError(`chat:${characterId}`, 'STORAGE_INVALID_SHAPE');
                return value;
            });
        },

        async applyChatChanges(characterId, upserts, deletes) {
            await this.init();
            assertWritable(`chat:${characterId}`);
            const plugin = nativePlugin();
            const changes = { upserts: cloneJson(upserts || []), deletes: [...(deletes || [])] };
            if (plugin) {
                await plugin.chatApply({ characterId: String(characterId), changesJson: JSON.stringify(changes) });
                return;
            }
            const current = await this.loadChat(characterId);
            const byId = new Map(current.map((message, position) => [message.id, { message, position }]));
            changes.deletes.forEach(id => byId.delete(id));
            changes.upserts.forEach(item => byId.set(item.message.id, item));
            const messages = [...byId.values()].sort((a, b) => a.position - b.position).map(item => item.message);
            chatFallbackSet(String(characterId), JSON.stringify(messages));
        },

        async replaceChat(characterId, messages) {
            await this.init();
            assertWritable(`chat:${characterId}`);
            const plugin = nativePlugin();
            if (plugin) await plugin.chatReplace({ characterId: String(characterId), messagesJson: JSON.stringify(cloneJson(messages || [])) });
            else chatFallbackSet(String(characterId), JSON.stringify(cloneJson(messages || [])));
        },

        async deleteChat(characterId) {
            await this.init();
            assertWritable(`chat:${characterId}`);
            const plugin = nativePlugin();
            if (plugin) await plugin.chatDelete({ characterId: String(characterId) });
            else chatFallbackRemove(String(characterId));
        },

        async deleteFragments(characterId) {
            await this.init();
            const plugin = nativePlugin();
            if (plugin) await plugin.memoryDelete({ characterId: String(characterId) });
            else memoryFragments.delete(String(characterId));
        },

        async writeMediaDataUrl(dataUrl, preferredName = '') {
            const plugin = nativePlugin();
            if (!plugin) return dataUrl;
            const result = await plugin.mediaWriteDataUrl({ dataUrl, preferredName });
            return window.Capacitor.convertFileSrc(result.uri);
        },

        async exportBackup() {
            const plugin = nativePlugin();
            if (!plugin) throw new Error('完整备份仅在 Android App 中可用');
            return plugin.exportBackup();
        },

        async restoreBackup() {
            const plugin = nativePlugin();
            if (!plugin) throw new Error('完整恢复仅在 Android App 中可用');
            return plugin.restoreBackup();
        }
    };

    const RPHStorage = repository;


export { RPHStorage };


