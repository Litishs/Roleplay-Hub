// Page background: built-in presets plus a user-supplied image (M4, 2026-11-26).
//
// Design record: documents/界面材质与页面底图工程方案.md §5.
//
// The user image lives at media/page-background.jpg inside the app's private
// files directory. That is deliberate: createBackup() packs the whole media/
// directory (and restore replaces it wholesale), so the background travels with
// a backup for free — it is personalised user data, exactly what a backup is
// for. Keeping it out of the DB also means the backup carries it as a plain
// file instead of a multi-megabyte base64 column.
//
// settings.pageBackground stores only the *choice* ('off' | 'aurora' | 'dune' |
// 'custom'), never image data: the settings object is persisted key-by-key and
// would otherwise drag the whole picture through every autosave.

const DIRECTORY_DATA = 'DATA';
const BACKGROUND_DIRECTORY = 'media';
const BACKGROUND_FILE = 'page-background.jpg';

// Longest edge. A phone screenshot is ~1170px wide; 1080 keeps the image crisp
// behind glass while staying well under the size cap.
const MAX_EDGE = 1080;
// JPEG quality and the hard byte ceiling from the design doc.
const JPEG_QUALITY = 0.8;
const MAX_BYTES = 500 * 1024;

const BACKGROUND_CHOICES = Object.freeze(['off', 'aurora', 'dune', 'custom']);

// Built-in presets, one file per theme so the artwork itself matches the theme
// instead of relying on an overlay to rescue a light image in dark mode.
const PRESET_FILES = Object.freeze({
    aurora: { light: 'assets/img/bg-aurora-light.svg', dark: 'assets/img/bg-aurora-dark.svg' },
    dune: { light: 'assets/img/bg-dune-light.svg', dark: 'assets/img/bg-dune-dark.svg' }
});

const normalizeChoice = (value) => (BACKGROUND_CHOICES.includes(value) ? value : 'off');

const isCustom = (value) => normalizeChoice(value) === 'custom';

// Only 'custom' resolves to a stored file; presets and 'off' need no IO.
const customBackgroundPath = () => `${BACKGROUND_DIRECTORY}/${BACKGROUND_FILE}`;

const plugins = () => (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) || {};

const filesystemPlugin = () => plugins().Filesystem || null;

// Native builds serve private files through Capacitor's local URL scheme; the
// browser dev server has no such bridge, which is why the dev fallback exists.
const toDisplayUrl = (uri) => {
    try {
        if (typeof window !== 'undefined' && window.Capacitor && typeof window.Capacitor.convertFileSrc === 'function') {
            return window.Capacitor.convertFileSrc(uri);
        }
    } catch (_) { /* fall through to the raw uri */ }
    return uri;
};

// ---- image preparation -----------------------------------------------------------

// Reads a File into a data URL. Kept separate from the resize step so the pure
// geometry helpers below stay testable without a DOM.
const readAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
});

// Fit inside a square of `maxEdge` without ever upscaling.
const fitWithin = (width, height, maxEdge = MAX_EDGE) => {
    const safeWidth = Math.max(1, Math.round(Number(width) || 0));
    const safeHeight = Math.max(1, Math.round(Number(height) || 0));
    const longest = Math.max(safeWidth, safeHeight);
    if (longest <= maxEdge) return { width: safeWidth, height: safeHeight };
    const scale = maxEdge / longest;
    return {
        width: Math.max(1, Math.round(safeWidth * scale)),
        height: Math.max(1, Math.round(safeHeight * scale))
    };
};

// Decode → downscale → re-encode as JPEG. Re-encoding is what actually shrinks
// a photo: a 4 MB camera JPEG at 1080px lands around 150-250 KB at q0.8.
// The quality steps down if the first attempt still overshoots the byte cap.
const compressToJpeg = async (source, options = {}) => {
    const maxEdge = options.maxEdge || MAX_EDGE;
    const maxBytes = options.maxBytes || MAX_BYTES;
    const qualities = options.qualities || [JPEG_QUALITY, 0.65, 0.5];
    if (typeof document === 'undefined') throw new Error('图片压缩需要浏览器环境');

    const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('图片格式无法识别'));
        element.src = source;
    });

    const { width, height } = fitWithin(image.naturalWidth || image.width, image.naturalHeight || image.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('图片压缩失败');
    context.drawImage(image, 0, 0, width, height);

    let dataUrl = '';
    for (const quality of qualities) {
        dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= maxBytes * 1.37) break; // base64 is ~4/3 of the bytes
    }
    // A data URL that never came back under the cap is still usable; the caller
    // decides whether to warn. Report the real size for that decision.
    return { dataUrl, width, height, bytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75) };
};

// ---- storage ---------------------------------------------------------------------

const base64FromDataUrl = (dataUrl) => {
    const comma = String(dataUrl || '').indexOf(',');
    return comma < 0 ? '' : dataUrl.slice(comma + 1);
};

const writeCustomBackground = async (dataUrl) => {
    const Filesystem = filesystemPlugin();
    if (!Filesystem) throw new Error('当前环境不支持保存底图');
    await Filesystem.writeFile({
        path: customBackgroundPath(),
        data: base64FromDataUrl(dataUrl),
        directory: DIRECTORY_DATA,
        recursive: true
    });
};

const removeCustomBackground = async () => {
    const Filesystem = filesystemPlugin();
    if (!Filesystem) return false;
    try {
        await Filesystem.deleteFile({ path: customBackgroundPath(), directory: DIRECTORY_DATA });
        return true;
    } catch (_) {
        // A missing file is the normal case when the user never set one.
        return false;
    }
};

// Resolves the URL to paint for the current choice, or '' for none. Checks the
// file actually exists so a restored-from-another-device backup that carries a
// 'custom' choice but no file degrades to 'off' instead of showing a broken img.
const resolveBackgroundUrl = async (choice) => {
    const normalized = normalizeChoice(choice);
    if (normalized === 'off') return '';
    if (PRESET_FILES[normalized]) return ''; // presets resolve synchronously in the renderer
    const Filesystem = filesystemPlugin();
    if (!Filesystem) return '';
    try {
        const { uri } = await Filesystem.getUri({ path: customBackgroundPath(), directory: DIRECTORY_DATA });
        return uri ? toDisplayUrl(uri) : '';
    } catch (_) {
        return '';
    }
};

// Full pipeline behind the settings row: read → compress → store → hand back the
// display URL. Throws with a user-facing message so the caller can toast it.
const applyCustomBackground = async (file) => {
    if (!file) throw new Error('没有选择图片');
    if (file.type && !file.type.startsWith('image/')) throw new Error('请选择图片文件');
    const raw = await readAsDataUrl(file);
    const compressed = await compressToJpeg(raw);
    await writeCustomBackground(compressed.dataUrl);
    const url = await resolveBackgroundUrl('custom');
    if (!url) throw new Error('底图保存失败');
    return { url, bytes: compressed.bytes, width: compressed.width, height: compressed.height };
};

const presetUrl = (choice, theme) => {
    const preset = PRESET_FILES[normalizeChoice(choice)];
    if (!preset) return '';
    return theme === 'dark' ? preset.dark : preset.light;
};

const RPHPageBackground = {
    BACKGROUND_CHOICES,
    PRESET_FILES,
    MAX_EDGE,
    MAX_BYTES,
    normalizeChoice,
    isCustom,
    fitWithin,
    compressToJpeg,
    resolveBackgroundUrl,
    applyCustomBackground,
    removeCustomBackground,
    presetUrl,
    customBackgroundPath
};

export {
    BACKGROUND_CHOICES,
    PRESET_FILES,
    MAX_EDGE,
    MAX_BYTES,
    normalizeChoice,
    isCustom,
    fitWithin,
    compressToJpeg,
    resolveBackgroundUrl,
    applyCustomBackground,
    removeCustomBackground,
    presetUrl,
    customBackgroundPath
};

globalThis.RPHPageBackground = RPHPageBackground;
if (typeof window !== 'undefined') window.RPHPageBackground = RPHPageBackground;
