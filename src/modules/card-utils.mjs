
    const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
    const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

    const imageStyleArtists = Object.freeze({
        vertical: 'masterpiece, best quality,[[[artist:dishwasher1910]]], {{yd_(orange_maru)}}, [artist:ciloranko], [artist:sho_(sho_lwlw)], [ningen mame], soft lighting,year 2024',
        comicDoujin: 'masterpiece, best quality, very aesthetic, modern Japanese anime, official anime art, anime key visual, anime screencap, soft cel shading, soft anime coloring, smooth color transitions, natural skin tones, restrained color palette, slightly desaturated, muted colors, soft ambient lighting, gentle contrast, subtle gradients, subtle bloom, detailed anime background',
        r18: `0.9::misaka_12003-gou ::, dino_(dinoartforame), wanke, liduke, year 2025, realistic, 4k, -2::green ::, textless version, The image is highly intricate finished drawn. Only the character's face is in anime style, but their body is in realistic style. 1.35::A highly finished photo-style artwork that has lively color, graphic texture, realistic skin surface, and lifelike flesh with little obliques::. 1.63::photorealistic::, 1.63::photo(medium)::,
20::best quality, absurdres, very aesthetic, detailed, masterpiece::,, very aesthetic, masterpiece, no text,`,
        lolita25d: `20::best quality, absurdres, very aesthetic, detailed, masterpiece::, 20::highly finished::, 10::ultra detailed::, 5::masterpiece::, 5::best quality::,

2.4::kidmo::, 1.2::omone hokoma agm::, 1.1::dino, wanke, liduke::, 0.8::rurudo, mignon, artist:pottsness, artist:toosaka asagi::, 0.7::misaka_12003-gou::, 0.6::artist:chocoan, artist:ciloranko, artist:rhasta, artist:sho_sho_lwlw::, dino_(dinoartforame), agoto, akakura, 0.9::rurudo(Only body shape), mignon(Only body shape) ::

year 2025, textless version, {{petite,loli}}, Petite figure, no text, The image is highly intricate finished drawn. Only the character's face is in anime style, but their body is in realistic style. 1.35::A highly finished photo-style artwork that has graphic texture, realistic skin surface, and lifelike flesh with little obliques::, smooth line, glossy skin, realistic, 4k,

1.63::photorealistic::, 1.63::photo(medium)::, 3::simple background::, 2::depth of field::,

1.5::vivid color, lively color::, desaturated, muted tones, cinematic desaturation, pale aesthetic, silver-toned,

-2::green::, -1.5::vibrant, colorful, saturated::`,
        anime: '1.4::asanagi::,{{{{{artist:asanagi}}}}},1.2::xiaoluo_xl::,1.3::Artist: misaka_12003-gou::,1.2::Artist:shexyo::,0.7::Artist:b.sa_(bbbs)::,1::Artist:qiandaiyiyu::,1.05::artist:natedecock::,1.05::artist:kunaboto::,0.75::artist:kandata_nijou::,1.05::artist:zer0.zer0 ::,1.05::artist:jasony::,0.75::misaka_12003-gou ::, dino_(dinoartforame), wanke, liduke, year 2025, realistic, 4k, -2::green ::, {textless version, The image is highly intricate finished drawn,write realistically,true to life}, 1.35::A highly finished photo-style artwork that has lively color, graphic texture, realistic skin surface, and lifelike flesh with little obliques::, 1.63::photorealistic::,3::age slider::,1.63::photo(medium)::, 2::best quality, absurdres, very aesthetic, detailed, masterpiece::,-4::Muscle definition, abs::',
        galgame: 'artist:ningen_mame,, noyu_(noyu23386566),, toosaka asagi,, location,\\n20::best quality, absurdres, very aesthetic, detailed, masterpiece::,:,, very aesthetic, masterpiece, no text,'
    });

    const getImageStyleArtists = (style, customArtists = '') => {
        if (style === 'custom') return customArtists || '';
        const normalizedStyle = style === 'default' ? 'vertical' : style === 'hentai' ? 'r18' : style;
        return imageStyleArtists[normalizedStyle] || imageStyleArtists.vertical;
    };

    const normalizeNativeReasoningPart = (value) => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map(normalizeNativeReasoningPart).join('');
        if (typeof value === 'object') {
            const keys = ['text', 'content', 'summary', 'reasoning', 'reasoning_content', 'thinking', 'thought', 'value'];
            for (const key of keys) {
                const text = normalizeNativeReasoningPart(value[key]);
                if (text) return text;
            }
            return '';
        }
        return String(value);
    };

    const extractNativeReasoning = (source = {}) => {
        if (!source || typeof source !== 'object') return '';
        const directKeys = ['reasoning_content', 'reasoning', 'thinking', 'thinking_content', 'thought', 'thoughts', 'reasoning_text'];
        for (const key of directKeys) {
            const text = normalizeNativeReasoningPart(source[key]);
            if (text) return text;
        }
        if (Array.isArray(source.reasoning_details)) {
            const text = normalizeNativeReasoningPart(source.reasoning_details);
            if (text) return text;
        }
        if (Array.isArray(source.content)) {
            return source.content.map(part => {
                const type = String(part?.type || '').toLowerCase();
                return type.includes('reason') || type.includes('thinking') || type.includes('thought')
                    ? normalizeNativeReasoningPart(part)
                    : '';
            }).join('');
        }
        return '';
    };

    const normalizeRegexModifiers = (pattern, flags = 'g') => {
        let normalizedPattern = pattern;
        let normalizedFlags = flags;
        for (const modifier of ['s', 'i', 'm']) {
            const marker = `(?${modifier})`;
            if (!normalizedPattern.includes(marker)) continue;
            normalizedPattern = normalizedPattern.split(marker).join('');
            if (!normalizedFlags.includes(modifier)) normalizedFlags += modifier;
        }
        return { pattern: normalizedPattern, flags: normalizedFlags };
    };

    const protectedContentPattern = /(<!DOCTYPE html>[\s\S]*?<\/html>|<html\b[^>]*>[\s\S]*?<\/html>|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<(?:cot|think)>[\s\S]*?(?:<\/(?:cot|think)>|<(?:cot|think)>|$)|```[\s\S]*?```|`[^`]+`|<\/?[a-zA-Z][\w:-]*[^>]*>)/gi;
    const exactProtectedContentPattern = /^(<!DOCTYPE html>[\s\S]*?<\/html>|<html\b[^>]*>[\s\S]*?<\/html>|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<(?:cot|think)>[\s\S]*?(?:<\/(?:cot|think)>|<(?:cot|think)>|$)|```[\s\S]*?```|`[^`]+`|<\/?[a-zA-Z][\w:-]*[^>]*>)$/i;

    const transformUnprotectedText = (text, transform) => String(text || '')
        .split(protectedContentPattern)
        .map(part => !part || exactProtectedContentPattern.test(part) ? part : transform(part))
        .join('');

    const encodeUtf8 = (value) => {
        if (textEncoder) return textEncoder.encode(String(value ?? ''));
        const encoded = encodeURIComponent(String(value ?? ''));
        const bytes = [];
        for (let i = 0; i < encoded.length; i += 1) {
            if (encoded[i] === '%') {
                bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
                i += 2;
            } else {
                bytes.push(encoded.charCodeAt(i));
            }
        }
        return new Uint8Array(bytes);
    };

    const decodeUtf8 = (bytes) => {
        if (textDecoder) return textDecoder.decode(bytes);
        let encoded = '';
        for (let i = 0; i < bytes.length; i += 1) {
            const hex = bytes[i].toString(16);
            encoded += '%' + (hex.length === 1 ? '0' + hex : hex);
        }
        try {
            return decodeURIComponent(encoded);
        } catch (_) {
            let text = '';
            for (let i = 0; i < bytes.length; i += 1) {
                text += String.fromCharCode(bytes[i]);
            }
            return text;
        }
    };

    const toBytes = (value) => {
        if (value instanceof Uint8Array) return value;
        if (value instanceof ArrayBuffer) return new Uint8Array(value);
        if (ArrayBuffer.isView(value)) {
            return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        }
        throw new TypeError('Expected ArrayBuffer or Uint8Array');
    };

    const encodeBase64Utf8 = (value) => {
        const bytes = encodeUtf8(value);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    };

    const decodeBase64Utf8 = (value) => {
        try {
            const binary = atob(String(value || '').trim());
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) {
                bytes[i] = binary.charCodeAt(i);
            }
            return decodeUtf8(bytes);
        } catch (_) {
            return String(value || '');
        }
    };

    const readPngChunks = (buffer) => {
        const bytes = toBytes(buffer);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const chunks = {};
        let offset = 8;

        try {
            while (offset + 8 <= bytes.byteLength) {
                const length = view.getUint32(offset, false);
                const type = String.fromCharCode(
                    view.getUint8(offset + 4),
                    view.getUint8(offset + 5),
                    view.getUint8(offset + 6),
                    view.getUint8(offset + 7)
                );
                const dataStart = offset + 8;
                const dataEnd = dataStart + length;
                if (dataEnd + 4 > bytes.byteLength) break;

                const data = bytes.slice(dataStart, dataEnd);
                if (type === 'tEXt') {
                    const splitIndex = data.indexOf(0);
                    if (splitIndex !== -1) {
                        const key = decodeUtf8(data.slice(0, splitIndex));
                        chunks[key] = decodeUtf8(data.slice(splitIndex + 1));
                    }
                } else if (type === 'iTXt') {
                    let cursor = 0;
                    while (cursor < data.length && data[cursor] !== 0) cursor += 1;
                    const key = decodeUtf8(data.slice(0, cursor));
                    cursor += 1;

                    if (cursor + 2 <= data.length) {
                        const compressionFlag = data[cursor];
                        cursor += 2;
                        while (cursor < data.length && data[cursor] !== 0) cursor += 1;
                        cursor += 1;
                        while (cursor < data.length && data[cursor] !== 0) cursor += 1;
                        cursor += 1;

                        if (key && cursor < data.length && compressionFlag === 0) {
                            chunks[key] = decodeUtf8(data.slice(cursor));
                        }
                    }
                }

                offset += 12 + length;
            }
        } catch (error) {
            console.warn('PNG chunk read failed:', error);
        }

        return chunks;
    };

    const findPngCharacterPayload = (chunks) => {
        if (chunks.chara) return chunks.chara;
        if (chunks.ccv3) return chunks.ccv3;
        return Object.values(chunks).find((value) => {
            const text = String(value || '').trim();
            return text.length > 50 && (text.startsWith('{') || text.startsWith('ey'));
        }) || '';
    };

    const parseCharacterPayload = (payload) => {
        try {
            return JSON.parse(decodeBase64Utf8(payload));
        } catch (_) {
            return JSON.parse(String(payload || ''));
        }
    };

    const parsePngCharacterData = (buffer) => {
        const chunks = readPngChunks(buffer);
        const payload = findPngCharacterPayload(chunks);
        if (!payload) {
            const error = new Error('No character data found in PNG');
            error.chunks = chunks;
            throw error;
        }
        return {
            chunks,
            payload,
            data: parseCharacterPayload(payload)
        };
    };

    const mapExportItems = (items, mapper) => (
        Array.isArray(items) ? items.map((item, index) => mapper(item, index)) : []
    );

    const cloneJsonValue = (value, fallback) => {
        if (value === undefined || value === null) return fallback;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            return fallback;
        }
    };

    const toNumber = (value, fallback = null) => {
        if (value === undefined || value === null || value === '') return fallback;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    const toBoolean = (value, fallback = false) => {
        if (value === undefined || value === null || value === '') return fallback;
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === 'true') return true;
            if (normalized === 'false') return false;
        }
        return !!value;
    };

    const toWorldInfoExportEntry = (entry = {}) => ({
        comment: entry.comment || entry.name || '',
        content: entry.content || '',
        enabled: toBoolean(entry.enabled, true),
        scope: entry.scope || 'character',
        keys: Array.isArray(entry.keys) ? entry.keys : [],
        useRegex: toBoolean(entry.useRegex, false),
        constant: toBoolean(entry.constant, false),
        position: entry.position || 'at_depth',
        order: toNumber(entry.order, 0),
        depth: toNumber(entry.depth, 4),
        scanDepth: toNumber(entry.scanDepth, null),
        probability: toNumber(entry.probability, 100),
        useProbability: toBoolean(entry.useProbability, true)
    });

    const toRegexExportEntry = (script = {}) => {
        const placement = Array.isArray(script.placement)
            ? script.placement.map(Number).filter(value => value === 1 || value === 2)
            : [1, 2];
        const markdownOnly = toBoolean(script.markdownOnly, false);
        const promptOnly = markdownOnly ? false : toBoolean(script.promptOnly, false);

        return {
            name: script.name || script.scriptName || '',
            regex: script.regex || script.findRegex || '',
            flags: script.flags || script.regexFlags || 'g',
            replacement: script.replacement !== undefined ? script.replacement : (script.replaceString || ''),
            placement: placement.length ? placement : [2],
            markdownOnly,
            promptOnly,
            runOnEdit: toBoolean(script.runOnEdit, false),
            minDepth: toNumber(script.minDepth, null),
            maxDepth: toNumber(script.maxDepth, null),
            scope: script.scope || 'character',
            disabled: script.disabled !== undefined
                ? toBoolean(script.disabled, false)
                : !toBoolean(script.enabled, true)
        };
    };

    const toUiTemplateExportEntry = (template = {}, options = {}) => {
        const variableState = cloneJsonValue(template.variableState, {});
        return {
            id: template.id,
            name: template.name || 'UI模板',
            enabled: template.enabled !== false,
            scope: options.scope || template.scope || 'character',
            order: toNumber(template.order, 100),
            placement: ['top', 'bottom'].includes(template.placement) ? template.placement : 'bottom',
            htmlTemplate: template.htmlTemplate || template.template || '',
            initialVariableState: cloneJsonValue(template.initialVariableState, variableState),
            variableSchema: (typeof template.variableSchema === 'string' || typeof template.variableSchema === 'object')
                ? cloneJsonValue(template.variableSchema, template.variableSchema)
                : ''
        };
    };

    // External card fields that RolePlay Hub does not edit (SillyTavern / TavernAI
    // V1/V2 compatibility). When present on a character we keep them and write them
    // back on export so an import -> export round-trip is lossless.
    const preservedCardFields = Object.freeze([
        'mes_example',
        'system_prompt',
        'post_history_instructions',
        'alternate_greetings',
        'tags',
        'creator',
        'character_version',
        'spec',
        'spec_version'
    ]);

    const includeCardFieldIfPresent = (character, field) => {
        const value = character ? character[field] : undefined;
        if (value === undefined || value === null) return {};
        if (typeof value === 'string') return value === '' ? {} : { [field]: value };
        if (Array.isArray(value)) return value.length ? { [field]: cloneJsonValue(value, []) } : {};
        if (typeof value === 'object') return { [field]: cloneJsonValue(value, value) };
        return { [field]: value };
    };
    const buildCharacterCardData = (character = {}, options = {}) => {
        const worldInfoMapper = options.worldInfoMapper || toWorldInfoExportEntry;
        const regexScriptMapper = options.regexScriptMapper || toRegexExportEntry;
        const uiTemplateMapper = options.uiTemplateMapper || toUiTemplateExportEntry;
        const includeUiTemplates = options.includeUiTemplates !== false;
        const worldEntries = mapExportItems(
            character.worldInfo,
            worldInfoMapper
        );
        const regexScripts = mapExportItems(
            character.regexScripts,
            regexScriptMapper
        );
        const uiTemplates = includeUiTemplates
            ? mapExportItems(character.uiTemplates, uiTemplateMapper)
            : [];

        const data = {
            name: character.name,
            description: character.description,
            personality: character.personality,
            first_mes: character.first_mes,
            creator_notes: character.creator_notes || 'Exported from RolePlay Hub',
            ...Object.fromEntries(preservedCardFields.map(field => {
                const entry = includeCardFieldIfPresent(character, field);
                return Object.keys(entry).length ? [field, entry[field]] : null;
            }).filter(Boolean)),
            ...(includeUiTemplates ? { uiTemplates } : {}),
            extensions: {
                ...(character.rawExtensions && typeof character.rawExtensions === 'object' ? character.rawExtensions : {}),
                rp_hub_watermark: 'rp-hub',
                regex_scripts: regexScripts,
                ...(includeUiTemplates ? { rp_hub_ui_templates: uiTemplates } : {})
            },
            character_book: worldEntries.length > 0 ? { entries: worldEntries } : undefined
        };

        return { data };
    };

    const crc32Table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
        let c = i;
        for (let k = 0; k < 8; k += 1) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        crc32Table[i] = c;
    }

    const crc32 = (bytes) => {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i += 1) {
            crc = (crc >>> 8) ^ crc32Table[(crc ^ bytes[i]) & 0xFF];
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    };

    const createTextChunk = (key, value) => {
        const type = encodeUtf8('tEXt');
        const keyData = encodeUtf8(key);
        const valueData = encodeUtf8(value);
        const chunkData = new Uint8Array(keyData.length + 1 + valueData.length);
        chunkData.set(keyData, 0);
        chunkData[keyData.length] = 0;
        chunkData.set(valueData, keyData.length + 1);

        const crcInput = new Uint8Array(type.length + chunkData.length);
        crcInput.set(type, 0);
        crcInput.set(chunkData, type.length);

        const fullChunk = new Uint8Array(12 + chunkData.length);
        const view = new DataView(fullChunk.buffer);
        view.setUint32(0, chunkData.length, false);
        fullChunk.set(type, 4);
        fullChunk.set(chunkData, 8);
        view.setUint32(8 + chunkData.length, crc32(crcInput), false);
        return fullChunk;
    };

    const injectPngTextChunk = (pngBuffer, key, value) => {
        const pngBytes = toBytes(pngBuffer);
        const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
        const textChunk = createTextChunk(key, value);
        let insertPos = 33;
        let offset = 8;

        while (offset + 8 <= pngBytes.byteLength) {
            const length = view.getUint32(offset, false);
            const type = String.fromCharCode(
                view.getUint8(offset + 4),
                view.getUint8(offset + 5),
                view.getUint8(offset + 6),
                view.getUint8(offset + 7)
            );
            const nextOffset = offset + 12 + length;
            if (type === 'IHDR') {
                insertPos = nextOffset;
                break;
            }
            offset = nextOffset;
        }

        const result = new Uint8Array(pngBytes.length + textChunk.length);
        result.set(pngBytes.slice(0, insertPos), 0);
        result.set(textChunk, insertPos);
        result.set(pngBytes.slice(insertPos), insertPos + textChunk.length);
        return result;
    };

    const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });

    const imageUrlToPngBytes = (src, options = {}) => new Promise((resolve, reject) => {
        const img = new Image();
        if (options.crossOrigin !== undefined && options.crossOrigin !== null) {
            img.crossOrigin = options.crossOrigin;
        }
        if (options.referrerPolicy) {
            img.referrerPolicy = options.referrerPolicy;
        }
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    reject(new Error('Could not create PNG blob'));
                    return;
                }
                try {
                    resolve(new Uint8Array(await blob.arrayBuffer()));
                } catch (error) {
                    reject(error);
                }
            }, 'image/png');
        };
        img.onerror = () => reject(new Error('Could not load image'));
        img.src = src;
    });

    const downloadBlobInBrowser = (blob, filename, options = {}) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        if (options.targetBlank) a.target = '_blank';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        const cleanup = () => {
            if (a.parentNode) a.parentNode.removeChild(a);
            URL.revokeObjectURL(url);
        };
        const delay = Number(options.revokeDelay || 0);
        if (delay > 0) {
            setTimeout(cleanup, delay);
        } else {
            cleanup();
        }
    };

    const safeExportName = (filename) => String(filename || 'roleplay-hub-export')
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
        .slice(0, 160);

    const exportMimeForName = (name, blob) => {
        const extension = name.split('.').pop()?.toLowerCase();
        const fallbackMimeTypes = {
            json: 'application/json',
            jsonl: 'application/x-ndjson',
            png: 'image/png',
            zip: 'application/zip'
        };
        return fallbackMimeTypes[extension] || blob.type || 'application/octet-stream';
    };

    const readBlobSliceAsBase64 = (blob, start, end) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result || '').split(',')[1] || '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob.slice(start, end));
    });

    // Stream a Blob to the native create-document picker in bounded base64 chunks.
    // This keeps the peak memory proportional to one chunk instead of the whole
    // file (the previous whole-file Base64 bridge doubled memory for large files).
    const downloadBlobChunked = async (blob, filename, nativeStorage) => {
        const safeName = safeExportName(filename);
        const mimeType = exportMimeForName(safeName, blob);
        const sessionId = 'export-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        const startResult = await nativeStorage.exportFileStart({ sessionId, fileName: safeName, mimeType });
        if (!startResult || startResult.ready !== true) {
            return { saved: false, target: 'document', cancelled: true };
        }
        const CHUNK_BYTES = 512 * 1024;
        const total = blob.size;
        for (let offset = 0; offset < total; offset += CHUNK_BYTES) {
            const chunk = await readBlobSliceAsBase64(blob, offset, Math.min(offset + CHUNK_BYTES, total));
            await nativeStorage.exportFileWrite({ sessionId, chunk });
        }
        const result = await nativeStorage.exportFileEnd({ sessionId });
        return { ...(result || {}), target: 'document' };
    };

    // --- Iframe export bridge -----------------------------------------------
    // The character-card workshop (character/index.html) runs inside an iframe
    // whose sandbox keeps allow-same-origin, so it reaches the native bridge via
    // window.parent.Capacitor. But the native create-document picker uses
    // startActivityForResult + an @ActivityCallback, and that callback never
    // resolves back across the frame boundary — exportFileStart() hangs silently
    // and no picker ever appears. To work around this, an iframe delegates the
    // whole native export to its parent frame through postMessage; the parent
    // runs the identical downloadBlob() (where the plugin callback resolves) and
    // returns the result. The parent installs its listener once at module load.
    const EXPORT_BRIDGE_REQ = 'rph:export-blob';
    const EXPORT_BRIDGE_ACK = 'rph:export-blob-ack';
    const EXPORT_BRIDGE_RES = 'rph:export-blob-result';

    const downloadBlobViaParentFrame = (blob, filename, options = {}) => new Promise((resolve, reject) => {
        const id = 'exp-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        let origin = '*';
        try { origin = window.location.origin || '*'; } catch (_) { }
        let ackTimer = null;
        let resTimer = null;
        const cleanup = () => {
            if (ackTimer) { clearTimeout(ackTimer); ackTimer = null; }
            if (resTimer) { clearTimeout(resTimer); resTimer = null; }
            window.removeEventListener('message', onMessage);
        };
        const onMessage = (event) => {
            const data = event.data;
            if (!data || data.id !== id) return;
            if (data.type === EXPORT_BRIDGE_ACK) {
                // Parent has the bridge and is handling the request; only the
                // final result remains, which may take as long as the user
                // spends in the system file picker.
                if (ackTimer) { clearTimeout(ackTimer); ackTimer = null; }
                return;
            }
            if (data.type === EXPORT_BRIDGE_RES) {
                cleanup();
                if (data.error) reject(new Error(data.error.message || 'export failed in parent frame'));
                else resolve(data.result || { saved: true, target: 'document' });
            }
        };
        // No ACK within a short window means the parent has no bridge installed
        // (e.g. the workshop iframe is opened outside the app shell); bail out
        // so the caller surfaces an error instead of hanging forever.
        ackTimer = setTimeout(() => { cleanup(); reject(new Error('iframe export bridge unavailable')); }, 3000);
        // Safety net: if the parent acknowledged but the export never completes,
        // reject after a generous grace period.
        resTimer = setTimeout(() => { cleanup(); reject(new Error('iframe export timed out')); }, 300000);
        window.addEventListener('message', onMessage);
        try {
            window.parent.postMessage(
                { type: EXPORT_BRIDGE_REQ, id, blob, filename, options },
                origin
            );
        } catch (error) {
            cleanup();
            reject(error);
        }
    });

    let iframeExportBridgeInstalled = false;
    const installIframeExportBridge = () => {
        if (iframeExportBridgeInstalled) return;
        if (typeof window === 'undefined' || !window.addEventListener) return;
        iframeExportBridgeInstalled = true;
        window.addEventListener('message', async (event) => {
            const data = event.data;
            if (!data || data.type !== EXPORT_BRIDGE_REQ) return;
            const source = event.source;
            if (!source) return;
            // Only answer requests from our own (same-origin) child frames.
            try { if (event.origin !== window.location.origin) return; } catch (_) { return; }
            const reply = (payload) => {
                try { source.postMessage({ id: data.id, ...payload }, event.origin); } catch (_) { }
            };
            reply({ type: EXPORT_BRIDGE_ACK });
            try {
                const result = await downloadBlob(data.blob, data.filename, data.options || {});
                reply({ type: EXPORT_BRIDGE_RES, result });
            } catch (error) {
                reply({ type: EXPORT_BRIDGE_RES, error: { message: error?.message || String(error) } });
            }
        });
    };

    const downloadBlob = async (blob, filename, options = {}) => {
        let capacitor = window.Capacitor;
        try {
            if (!capacitor && window.parent !== window) capacitor = window.parent.Capacitor;
        } catch (_) { }
        // Inside the character-card workshop iframe the native create-document
        // ActivityCallback never resolves across the frame boundary, so the picker
        // would hang. Delegate the whole export to the parent frame, where the
        // plugin callback works. Falls through on any failure.
        if (window.parent !== window) {
            try {
                if (capacitor?.Plugins?.NativeStorage?.exportFile) {
                    return await downloadBlobViaParentFrame(blob, filename, options);
                }
            } catch (error) {
                console.error('Parent-frame export bridge failed:', error);
            }
        }
        const nativeStorage = capacitor?.Plugins?.NativeStorage;
        if (!nativeStorage?.exportFile) {
            downloadBlobInBrowser(blob, filename, options);
            return { saved: true, target: 'browser' };
        }
        if (nativeStorage.exportFileStart && nativeStorage.exportFileEnd) {
            try {
                return await downloadBlobChunked(blob, filename, nativeStorage);
            } catch (error) {
                // Never reopen the picker after the user cancelled it.
                if (String(error?.message || error).toLowerCase().includes('cancel')) {
                    return { saved: false, target: 'document', cancelled: true };
                }
                console.error('Chunked export failed, falling back to whole-file export:', error);
            }
        }

        const dataUrl = await blobToDataUrl(blob);
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const safeName = safeExportName(filename);
        const result = await nativeStorage.exportFile({
            fileName: safeName,
            mimeType: exportMimeForName(safeName, blob),
            data: base64
        });
        return { ...result, target: 'document' };
    };

    installIframeExportBridge();

    const RPHubCardUtils =  {
        blobToDataUrl,
        buildCharacterCardData,
        decodeBase64Utf8,
        downloadBlob,
        encodeBase64Utf8,
        extractNativeReasoning,
        findPngCharacterPayload,
        getImageStyleArtists,
        imageUrlToPngBytes,
        injectPngTextChunk,
        normalizeRegexModifiers,
        parseCharacterPayload,
        parsePngCharacterData,
        readPngChunks,
        toBoolean,
        toNumber,
        toRegexExportEntry,
        toUiTemplateExportEntry,
        toWorldInfoExportEntry,
        transformUnprotectedText
    };


export { RPHubCardUtils };
globalThis.RPHubCardUtils = RPHubCardUtils;
if (typeof window !== "undefined") window.RPHubCardUtils = RPHubCardUtils;
