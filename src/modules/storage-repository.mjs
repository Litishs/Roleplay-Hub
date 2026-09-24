
    'use strict';

    const nativePlugin = () => window.Capacitor?.Plugins?.NativeStorage || null;
    const memoryStore = new Map();
    const memoryChats = new Map();
    const memoryFragments = new Map();
    const memorySecrets = new Map();
    // init 并发守卫：启动期并发的 set/get 只触发一次 plugin.init()，
    // 避免原生初始化（可能含迁移逻辑）的竞态。
    let initPromise = null;
    // loadFragments/applyFragments 已删除：全仓零调用方，且
    // tests/story-branch-contract.test.mjs 明确断言 fact fragment persistence
    // "stays removed"。memoryFragments Map 保留（deleteFragments 仍在使用）。

    const parseJson = (json, fallback, key = '(unknown)') => {
        if (json === null || json === undefined || json === '') return fallback;
        try { return JSON.parse(json); } catch (error) {
            // 损坏 JSON 不能静默降级：读失败与空数据不可区分会误导上层把可恢复的旧记录
            // 当成空数据整份覆盖（replaceChat 是整删整写语义）。至少留下带 key 的现场日志。
            console.error(`[StorageRepository] corrupt JSON for "${key}" (length=${String(json).length}), falling back:`, error?.message || error);
            return fallback;
        }
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

    const isSecretBearingKey = key => /rp_hub_(settings|active_tools)$/.test(String(key));

    // 密钥存储的 key 白名单：当前仓库内合法用途只有 `config:rp_hub_settings` /
    // `config:rp_hub_active_tools` 两类（见 set/get/remove 中的三处调用）。RPHStorage
    // 整体挂在 window 上供卡片 iframe 使用，一旦沙箱被绕过，任意 key 的密钥读取
    // 都将成为攻击面——这里把可读范围收敛到白名单前缀。
    const assertSecretKey = (key) => {
        if (!/^config:rp_hub_(settings|active_tools)$/.test(String(key))) {
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
                    else console.warn('[StorageRepository] Native plugin unavailable; using volatile development storage.');
                })();
            }
            await initPromise;
        },

        async set(key, value) {
            await this.init();
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
            const value = parseJson(response.json, undefined, key);
            if (value === undefined || !isSecretBearingKey(key)) return value;
            const secrets = parseJson(await this.getSecret(`config:${key}`), {}, `secrets:${key}`);
            if (!Object.keys(secrets).length) {
                // 公开数据存在但密钥回读为空：可能是两段写崩溃窗口或 apply() 异步落盘丢失，
                // 提前留痕便于排查“API Key 无声消失”类故障。
                console.warn(`[StorageRepository] "${key}" has public data but an empty secret store; keys may have been lost`);
            }
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
            assertSecretKey(key);
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
            const value = parseJson(response.json, [], `chat:${characterId}`);
            // 形状校验：合法 JSON 但非数组（schema 演进残留/其它 bug 写入）不能穿透炸下游，
            // 统一降级为空数组并留痕。
            if (!Array.isArray(value)) {
                console.error(`[StorageRepository] chat "${characterId}" has non-array shape (${typeof value}); returning empty`);
                return [];
            }
            return value;
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


