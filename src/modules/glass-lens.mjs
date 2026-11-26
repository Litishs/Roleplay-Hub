// Interface material: tier detection + liquid-glass edge refraction (M1, 2026-11-26).
//
// Design record: documents/界面材质与页面底图工程方案.md.
//
// Two recipes live in styles.css and are selected purely by class:
//   .rph-glass.rph-acrylic      frosted acrylic (blur + tint + grain)
//   .rph-glass.rph-glass-island liquid glass (little tint; refraction injected here)
//   .rph-glass.rph-glass-bar    liquid glass, floating tab bar
//
// This module owns the three-way tier decision and writes it to
// <html data-effects="glass|acrylic|solid">, which is how styles.css picks the
// solid fallback. Phones keep a global backdrop-filter kill-switch
// (`*:not(.rph-glass)` in the mobile media block), so only elements that
// explicitly carry .rph-glass get a material at all.
//
// The refraction is real: backdrop-filter accepts an SVG filter in Chromium and
// can sample content outside the element's box, so a displacement map built for
// the element's own size bends the backdrop at its edges. Verified in desktop
// Edge (prototype documents/UI材质对比-亚克力与液态玻璃-2026-11-26.html);
// Android WebView support is the open question and decides the real-device tier.

const SVG_NS = 'http://www.w3.org/2000/svg';

// Tier names, most capable first. Order matters: detectMaterialTier walks down.
const MATERIAL_TIERS = Object.freeze(['glass', 'acrylic', 'solid']);

// Hidden <svg><defs> host in index.html. Filters are appended here once per
// element size and reused by every element of that size.
const LENS_DEFS_ID = 'rph-lens-defs';

// Cache bound: lens ids are keyed by geometry, so a resizing window would
// otherwise grow the defs forever. Well above the on-screen surface budget.
const FILTER_CACHE_LIMIT = 12;

const RESIZE_DEBOUNCE_MS = 180;

// "bottom" mode pretends the shape extends far above and to the sides, so only
// the bottom edge refracts — right for a page head that sits on the screen edge.
const FAR = 4000;

const normalizeEnabled = (value) => value !== false && value !== 'false' && value !== 0;

const cssSupports = (property, value) => {
    try {
        return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports(property, value);
    } catch (_) {
        return false;
    }
};

// System-level "reduce transparency" is a hard override: it means the user
// already told the OS that see-through surfaces are unwanted.
const prefersReducedTransparency = () => {
    try {
        const query = typeof window !== 'undefined' && window.matchMedia
            ? window.matchMedia('(prefers-reduced-transparency: reduce)')
            : null;
        return !!(query && query.matches);
    } catch (_) {
        return false;
    }
};

// glass    → backdrop-filter accepts url(), so real edge refraction is possible
// acrylic  → only blur() is available, fall back to frosted surfaces
// solid    → no backdrop-filter, user switched effects off, or the OS asked for
//            reduced transparency; this is the pre-material look
const detectMaterialTier = (options = {}) => {
    if (!normalizeEnabled(options.enabled)) return 'solid';
    if (prefersReducedTransparency()) return 'solid';
    if (cssSupports('backdrop-filter', 'url(#rph-lens)') || cssSupports('-webkit-backdrop-filter', 'url(#rph-lens)')) return 'glass';
    if (cssSupports('backdrop-filter', 'blur(2px)') || cssSupports('-webkit-backdrop-filter', 'blur(2px)')) return 'acrylic';
    return 'solid';
};

const isMaterialTier = (tier) => MATERIAL_TIERS.includes(tier);

// Single writer for the tier attribute. styles.css keys the solid fallback off
// it, so this must run before the first material surface paints.
const applyMaterialTier = (tier) => {
    const next = isMaterialTier(tier) ? tier : 'solid';
    try {
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.dataset.effects = next;
        }
    } catch (_) { /* no DOM (tests): the return value still carries the tier */ }
    return next;
};

// ---- refraction ------------------------------------------------------------------

const lensDefsHost = () => {
    if (typeof document === 'undefined') return null;
    return document.getElementById(LENS_DEFS_ID);
};

const readToken = (name, fallback) => {
    try {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        const number = parseFloat(raw);
        return Number.isFinite(number) ? number : fallback;
    } catch (_) {
        return fallback;
    }
};

// Builds the displacement map: neutral grey (128) in the middle, and inside the
// edge band the sampled point is pushed outward, so content just outside the
// shape is pulled in and compressed along the rim.
//
// The map is a canvas because per-pixel signed distance is not expressible in
// SVG primitives. 8-bit channel values are enough: feDisplacementMap with
// scale=255 turns each unit of deviation into one pixel of offset.
const buildDisplacementMap = (width, height, radius, mode, band, amplitude) => {
    if (typeof document === 'undefined') return '';
    const extend = mode === 'bottom' ? FAR : 0;
    const shapeWidth = width + extend * 2;
    const shapeHeight = height + extend;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return '';
    const image = context.createImageData(width, height);
    const data = image.data;
    for (let y = 0; y < height; y += 1) {
        const py = y + 0.5 + extend - shapeHeight / 2;
        for (let x = 0; x < width; x += 1) {
            const px = x + 0.5 + extend - shapeWidth / 2;
            // Rounded-rectangle signed distance (negative inside the shape).
            const qx = Math.abs(px) - (shapeWidth / 2 - radius);
            const qy = Math.abs(py) - (shapeHeight / 2 - radius);
            const dx = Math.max(qx, 0);
            const dy = Math.max(qy, 0);
            const distance = Math.hypot(dx, dy) + Math.min(Math.max(qx, qy), 0) - radius;
            let nx = 0;
            let ny = 0;
            if (dx > 0 || dy > 0) {
                const length = Math.hypot(dx, dy) || 1;
                nx = (dx / length) * Math.sign(px);
                ny = (dy / length) * Math.sign(py);
            } else if (qx > qy) {
                nx = Math.sign(px);
            } else {
                ny = Math.sign(py);
            }
            const depth = -distance;
            let offset = 0;
            if (depth < band) {
                // Cubic near the rim plus a softer tail: a straight linear ramp
                // reads as a visible step where the band ends.
                const falloff = 1 - Math.max(depth, 0) / band;
                offset = amplitude * (0.62 * falloff * falloff * falloff + 0.38 * Math.pow(falloff, 1.3));
            }
            const index = (y * width + x) * 4;
            data[index] = 128 + offset * nx;
            data[index + 1] = 128 + offset * ny;
            data[index + 2] = 128;
            data[index + 3] = 255;
        }
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
};

// Cached by geometry; the cache is per-session and cleared on resize.
const filterCache = new Map();
let filterSequence = 0;

const filterFor = (geometry) => {
    const { width, height, radius, mode, band, amplitude } = geometry;
    const key = [width, height, radius, mode, band.toFixed(1), amplitude.toFixed(1)].join('x');
    if (filterCache.has(key)) return filterCache.get(key);
    const host = lensDefsHost();
    if (!host) return null;

    const id = `rph-lens-${(filterSequence += 1)}`;
    const filter = document.createElementNS(SVG_NS, 'filter');
    const filterAttributes = {
        id,
        x: '0',
        y: '0',
        width: '100%',
        height: '100%',
        filterUnits: 'objectBoundingBox',
        'color-interpolation-filters': 'sRGB'
    };
    Object.keys(filterAttributes).forEach((name) => filter.setAttribute(name, filterAttributes[name]));

    const image = document.createElementNS(SVG_NS, 'feImage');
    const imageAttributes = {
        href: buildDisplacementMap(width, height, radius, mode, band, amplitude),
        x: '0',
        y: '0',
        width: String(width),
        height: String(height),
        preserveAspectRatio: 'none',
        result: 'map'
    };
    Object.keys(imageAttributes).forEach((name) => image.setAttribute(name, imageAttributes[name]));

    const displacement = document.createElementNS(SVG_NS, 'feDisplacementMap');
    // 255 so an 8-bit map value of 128 + n moves the sample point by n px
    // (displacement = scale * (value / 255 - 0.5); scale=1 is under 1px, i.e. no
    // visible refraction). This value is a constant of the technique, not a knob.
    const displacementAttributes = {
        in: 'SourceGraphic',
        in2: 'map',
        scale: '255',
        xChannelSelector: 'R',
        yChannelSelector: 'G'
    };
    Object.keys(displacementAttributes).forEach((name) => displacement.setAttribute(name, displacementAttributes[name]));

    filter.append(image, displacement);
    host.appendChild(filter);
    filterCache.set(key, id);
    while (filterCache.size > FILTER_CACHE_LIMIT) {
        const oldestKey = filterCache.keys().next().value;
        const oldestId = filterCache.get(oldestKey);
        filterCache.delete(oldestKey);
        const stale = host.querySelector(`#${oldestId}`);
        if (stale) stale.remove();
    }
    return id;
};

// Elements that may carry refraction. Both classes are liquid glass; the tier
// check keeps the whole pass inert on acrylic/solid devices.
const LENS_SELECTOR = '.rph-glass.rph-glass-island, .rph-glass.rph-glass-bar';

const clearLens = (element) => {
    if (!element.dataset.lensValue) return;
    delete element.dataset.lensValue;
    element.style.webkitBackdropFilter = '';
    element.style.backdropFilter = '';
};

const resetLenses = () => {
    filterCache.clear();
    filterSequence = 0;
    const host = lensDefsHost();
    if (host) host.replaceChildren();
    if (typeof document === 'undefined') return;
    document.querySelectorAll(LENS_SELECTOR).forEach(clearLens);
};

// Applies (or clears) the refraction filter on every liquid-glass surface.
// Runs on tier changes, on mount, and after a debounced resize: geometry is
// baked into the map, so a keyboard slide or a rotation invalidates it.
const refreshLenses = (options = {}) => {
    if (typeof document === 'undefined') return 0;
    const tier = isMaterialTier(options.tier) ? options.tier : detectMaterialTier(options);
    const elements = document.querySelectorAll(LENS_SELECTOR);
    if (tier !== 'glass') {
        elements.forEach(clearLens);
        return 0;
    }

    const saturate = readToken('--glass-saturate', 165);
    const bandMax = readToken('--glass-band', 16);
    const refract = readToken('--glass-refract', 26);
    const blurSteps = {
        tight: readToken('--glass-blur-tight', 3),
        normal: readToken('--glass-blur', 12),
        panel: readToken('--glass-blur-panel', 24)
    };

    let applied = 0;
    elements.forEach((element) => {
        const width = Math.round(element.offsetWidth);
        const height = Math.round(element.offsetHeight);
        // Not laid out (hidden view, or v-show'd away): skip it AND drop any
        // filter it still carries. A display:none surface is not composited, so
        // keeping an inline backdrop-filter on it would only hold a texture
        // alive; the visibility observer rebuilds the map when it comes back.
        if (!width || !height) {
            clearLens(element);
            return;
        }
        const mode = element.dataset.lens === 'bottom' ? 'bottom' : 'all';
        const radius = Math.min(
            parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0,
            width / 2,
            height / 2
        );
        const blur = blurSteps[element.dataset.lensBlur] || blurSteps.normal;
        // Small controls get a proportionally thinner band, otherwise the whole
        // control is one bent rim.
        const band = Math.min(bandMax, Math.min(width, height) * 0.28);
        const amplitude = band * (refract / bandMax);
        const id = filterFor({ width, height, radius: Math.round(radius), mode, band, amplitude });
        if (!id) return;
        const value = `blur(${blur}px) saturate(${saturate}%) url(#${id})`;
        if (element.dataset.lensValue === value) return;
        element.dataset.lensValue = value;
        element.style.webkitBackdropFilter = value;
        element.style.backdropFilter = value;
        applied += 1;
    });
    return applied;
};

// ---- wiring ----------------------------------------------------------------------

// Detect, publish the tier and (on the glass tier) build the refraction filters.
// Returns the tier so the caller can record it in RPHRuntimePolicy for
// diagnostics and show "unsupported" on the settings row.
const applyMaterialEffects = (options = {}) => {
    const tier = applyMaterialTier(detectMaterialTier(options));
    if (tier === 'glass') refreshLenses({ tier });
    else if (typeof document !== 'undefined') document.querySelectorAll(LENS_SELECTOR).forEach(clearLens);
    return tier;
};

// A glass surface inside a hidden view (the tab bar on a detail page) has no
// geometry, so refreshLenses skips it. When the view comes back its size may
// have changed meanwhile (rotation, keyboard), so the surface needs a fresh map
// at the moment it becomes visible. One shared observer: surfaces are created
// and destroyed by v-show, not re-created, so this is a small fixed set.
let visibilityObserver = null;

const observeLensSurfaces = (onVisible) => {
    if (typeof IntersectionObserver === 'undefined' || typeof document === 'undefined') return null;
    if (!visibilityObserver) {
        visibilityObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                // The map is baked from offsetWidth/Height, which are only valid
                // once layout has run for the now-visible element.
                onVisible();
                return;
            }
        }, { threshold: 0 });
    }
    document.querySelectorAll(LENS_SELECTOR).forEach((element) => visibilityObserver.observe(element));
    return visibilityObserver;
};

// One entry point for app.mjs: re-applies on effect-toggle changes and keeps the
// lens geometry in step with the viewport. `options` may be a plain object or a
// function returning one — the resize and OS-setting paths re-read it, so a
// stale snapshot cannot resurrect effects the user switched off. `options.onTier`
// fires on every application so the caller can record the tier for diagnostics.
//
// Returns { apply, dispose }: apply() is what a settings watcher calls, dispose()
// belongs in onBeforeUnmount.
const initGlassLens = (options = {}) => {
    const readOptions = () => {
        const value = typeof options === 'function' ? options() : options;
        return value && typeof value === 'object' ? value : {};
    };
    const apply = () => {
        const current = readOptions();
        const tier = applyMaterialEffects(current);
        if (typeof current.onTier === 'function') current.onTier(tier);
        return tier;
    };
    apply();
    if (typeof window === 'undefined') return { apply, dispose: () => {} };

    // Templates mount after setup(), so the first pass usually sees no surfaces.
    // One frame later they exist: refresh so a statically classed surface gets
    // its refraction without waiting for a resize.
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
            apply();
            observeLensSurfaces(() => apply());
        });
    }

    let resizeTimer = 0;
    const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            resetLenses();
            apply();
        }, RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener('resize', onResize);

    // The OS setting can flip while the app runs (e.g. from quick settings).
    let transparencyQuery = null;
    const onTransparencyChange = () => apply();
    try {
        transparencyQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-transparency: reduce)') : null;
        if (transparencyQuery && transparencyQuery.addEventListener) {
            transparencyQuery.addEventListener('change', onTransparencyChange);
        }
    } catch (_) { /* older engines: the initial detection still stands */ }

    const dispose = () => {
        clearTimeout(resizeTimer);
        window.removeEventListener('resize', onResize);
        if (visibilityObserver) {
            visibilityObserver.disconnect();
            visibilityObserver = null;
        }
        try {
            if (transparencyQuery && transparencyQuery.removeEventListener) {
                transparencyQuery.removeEventListener('change', onTransparencyChange);
            }
        } catch (_) { /* nothing to detach */ }
    };

    return { apply, dispose };
};

const RPHGlassLens = {
    MATERIAL_TIERS,
    LENS_DEFS_ID,
    detectMaterialTier,
    applyMaterialTier,
    applyMaterialEffects,
    refreshLenses,
    resetLenses,
    initGlassLens
};

export {
    MATERIAL_TIERS,
    LENS_DEFS_ID,
    detectMaterialTier,
    applyMaterialTier,
    applyMaterialEffects,
    refreshLenses,
    resetLenses,
    initGlassLens
};

globalThis.RPHGlassLens = RPHGlassLens;
if (typeof window !== 'undefined') window.RPHGlassLens = RPHGlassLens;
