(function () {
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
                : '',
            updateMode: template.updateMode || 'merge'
        };
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
            ...(includeUiTemplates ? { uiTemplates } : {}),
            extensions: {
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

    const downloadBlob = (blob, filename, options = {}) => {
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

    window.RPHubCardUtils = {
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
})();
