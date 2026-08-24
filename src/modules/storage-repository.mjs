
    'use strict';

    const nativePlugin = () => window.Capacitor?.Plugins?.NativeStorage || null;
    const memoryStore = new Map();
    const memoryChats = new Map();
    const memoryFragments = new Map();
    const memorySecrets = new Map();
    let initialized = false;

    const parseJson = (json, fallback) => {
        if (json === null || json === undefined || json === '') return fallback;
        try { return JSON.parse(json); } catch (_) { return fallback; }
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
                if (/^(apiKey|imageGenKey|apiProviderKeys|tavilyApiKey)$/i.test(key)) {
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
                if (target?.[parts[index]] === undefined) return;
                target = target[parts[index]];
            }
            if (target && parts.length) target[parts[parts.length - 1]] = secret;
        });
        return result;
    };

    const isSecretBearingKey = key => /rp_hub_(settings|active_tools)$/.test(String(key));

    const repository = {
        get isNative() { return !!nativePlugin(); },

        async init() {
            if (initialized) return;
            const plugin = nativePlugin();
            if (plugin) await plugin.init();
            else console.warn('[StorageRepository] Native plugin unavailable; using volatile development storage.');
            initialized = true;
        },

        async set(key, value) {
            await this.init();
            let storedValue = cloneJson(value);
            if (isSecretBearingKey(key)) {
                const extracted = extractSecrets(storedValue);
                storedValue = extracted.publicValue;
                await this.setSecret(`config:${key}`, JSON.stringify(extracted.secrets));
            }
            const plugin = nativePlugin();
            const json = JSON.stringify(storedValue);
            if (plugin) await plugin.kvSet({ key, json });
            else memoryStore.set(key, json);
        },

        async get(key) {
            await this.init();
            const plugin = nativePlugin();
            const response = plugin ? await plugin.kvGet({ key }) : { json: memoryStore.get(key) ?? null };
            const value = parseJson(response.json, undefined);
            if (value === undefined || !isSecretBearingKey(key)) return value;
            const secrets = parseJson(await this.getSecret(`config:${key}`), {});
            return restoreSecrets(value, secrets);
        },

        async remove(key) {
            await this.init();
            const plugin = nativePlugin();
            if (plugin) await plugin.kvRemove({ key });
            else memoryStore.delete(key);
            if (isSecretBearingKey(key)) await this.removeSecret(`config:${key}`);
        },

        async setSecret(key, value) {
            const plugin = nativePlugin();
            if (plugin) await plugin.secretSet({ key, value: String(value ?? '') });
            else memorySecrets.set(key, String(value ?? ''));
        },

        async getSecret(key) {
            const plugin = nativePlugin();
            const response = plugin ? await plugin.secretGet({ key }) : { value: memorySecrets.get(key) ?? null };
            return response.value;
        },

        async removeSecret(key) {
            const plugin = nativePlugin();
            if (plugin) await plugin.secretRemove({ key });
            else memorySecrets.delete(key);
        },

        async loadChat(characterId) {
            await this.init();
            const plugin = nativePlugin();
            const response = plugin
                ? await plugin.chatGet({ characterId: String(characterId) })
                : { json: memoryChats.get(String(characterId)) || '[]' };
            return parseJson(response.json, []);
        },

        async applyChatChanges(characterId, upserts, deletes) {
            await this.init();
            const plugin = nativePlugin();
            const changes = { upserts: cloneJson(upserts || []), deletes: [...(deletes || [])] };
            if (plugin) {
                await plugin.chatApply({ characterId: String(characterId), changesJson: JSON.stringify(changes) });
                return;
            }
            const current = memoryChats.get(String(characterId)) || '[]';
            const byId = new Map(parseJson(current, []).map((message, position) => [message.id, { message, position }]));
            changes.deletes.forEach(id => byId.delete(id));
            changes.upserts.forEach(item => byId.set(item.message.id, item));
            const messages = [...byId.values()].sort((a, b) => a.position - b.position).map(item => item.message);
            memoryChats.set(String(characterId), JSON.stringify(messages));
        },

        async replaceChat(characterId, messages) {
            await this.init();
            const plugin = nativePlugin();
            if (plugin) await plugin.chatReplace({ characterId: String(characterId), messagesJson: JSON.stringify(cloneJson(messages || [])) });
            else memoryChats.set(String(characterId), JSON.stringify(cloneJson(messages || [])));
        },

        async deleteChat(characterId) {
            await this.init();
            const plugin = nativePlugin();
            if (plugin) await plugin.chatDelete({ characterId: String(characterId) });
            else memoryChats.delete(String(characterId));
        },

        async loadFragments(characterId) {
            await this.init();
            const plugin = nativePlugin();
            const response = plugin
                ? await plugin.memoryList({ characterId: String(characterId) })
                : { json: memoryFragments.get(String(characterId)) || '[]' };
            return parseJson(response.json, []);
        },

        async applyFragments(characterId, changes) {
            await this.init();
            const plugin = nativePlugin();
            const normalized = {
                upserts: cloneJson(changes?.upserts || []),
                deletes: cloneJson(changes?.deletes || [])
            };
            if (plugin) {
                await plugin.memoryApply({ characterId: String(characterId), changesJson: JSON.stringify(normalized) });
                return;
            }
            const key = String(characterId);
            const current = parseJson(memoryFragments.get(key) || '[]', []);
            const byRow = new Map(current.map(item => [`${item._kind}:${item._fragmentId}`, item]));
            normalized.deletes.forEach(item => byRow.delete(`${item.kind}:${item.id}`));
            normalized.upserts.forEach(item => {
                byRow.set(`${item.kind}:${item.id}`, { ...(item.data || item), _kind: item.kind, _fragmentId: item.id });
            });
            memoryFragments.set(key, JSON.stringify([...byRow.values()]));
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


globalThis.RPHStorage = RPHStorage;
if (typeof window !== "undefined") window.RPHStorage = RPHStorage;
