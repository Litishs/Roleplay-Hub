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

// Reads a File into a data URL. The image is never decoded or re-encoded here:
// since the 2026-11-26 review the picture is stored verbatim — no resize, no
// quality ladder, no byte cap — because the display layer paints it fill-first
// (cover), so any aspect ratio or resolution just works.
const readAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
});

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

// Full pipeline behind the settings row: read → store verbatim → hand back the
// display URL. The file name keeps the .jpg suffix so the native webserver
// serves an image/* mime; decoders sniff the real format from the magic bytes,
// so PNG/WEBP content under this name still paints. Throws with a user-facing
// message so the caller can toast it.
const applyCustomBackground = async (file) => {
    if (!file) throw new Error('没有选择图片');
    if (file.type && !file.type.startsWith('image/')) throw new Error('请选择图片文件');
    const dataUrl = await readAsDataUrl(file);
    await writeCustomBackground(dataUrl);
    const url = await resolveBackgroundUrl('custom');
    if (!url) throw new Error('底图保存失败');
    // Report the stored size for the success toast. base64 is ~4/3 of the bytes.
    const bytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
    return { url, bytes };
};

const presetUrl = (choice, theme) => {
    const preset = PRESET_FILES[normalizeChoice(choice)];
    if (!preset) return '';
    return theme === 'dark' ? preset.dark : preset.light;
};

const RPHPageBackground = {
    BACKGROUND_CHOICES,
    PRESET_FILES,
    normalizeChoice,
    isCustom,
    resolveBackgroundUrl,
    applyCustomBackground,
    removeCustomBackground,
    presetUrl,
    customBackgroundPath
};

export {
    BACKGROUND_CHOICES,
    PRESET_FILES,
    normalizeChoice,
    isCustom,
    resolveBackgroundUrl,
    applyCustomBackground,
    removeCustomBackground,
    presetUrl,
    customBackgroundPath
};

globalThis.RPHPageBackground = RPHPageBackground;
if (typeof window !== 'undefined') window.RPHPageBackground = RPHPageBackground;
