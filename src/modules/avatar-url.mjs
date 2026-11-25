// avatar-url — resolve oversized inline avatars to blob URLs for rendering.
//
// A card imported from a big PNG keeps its avatar as a multi-megabyte data
// URL. Browsers re-parse that string every time it lands in a CSS background
// (the chat blur layer) or a freshly rendered <img>, so web builds resolve it
// once per change to a blob: URL. Native builds already persist avatars to
// files (Capacitor.convertFileSrc), and those URLs pass straight through.
//
// The resolver keeps at most one object URL alive; replacing the avatar
// revokes the previous one.

const DEFAULT_THRESHOLD = 1024 * 1024;

const dataUrlToBlob = (source) => {
    const comma = source.indexOf(',');
    if (comma < 0) throw new Error('malformed data URL');
    const header = source.slice(5, comma); // skip "data:"
    const mime = header.split(';')[0] || 'image/png';
    const payload = source.slice(comma + 1);

    if (/;base64/i.test(header)) {
        const binary = atob(payload);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    }

    return new Blob([decodeURIComponent(payload)], { type: mime });
};

export function createAvatarUrlResolver({ threshold = DEFAULT_THRESHOLD } = {}) {
    let lastSource = null;
    let lastUrl = '';

    const revoke = () => {
        if (lastUrl.startsWith('blob:')) {
            try {
                URL.revokeObjectURL(lastUrl);
            } catch {
                // A revoked or foreign URL must never break rendering.
            }
        }
    };

    const resolve = (source) => {
        const value = typeof source === 'string' ? source : '';
        if (value === lastSource) return lastUrl;

        revoke();
        lastSource = value;
        lastUrl = value;

        if (value.length > threshold
            && value.startsWith('data:image/')
            && typeof URL?.createObjectURL === 'function') {
            try {
                lastUrl = URL.createObjectURL(dataUrlToBlob(value));
            } catch {
                lastUrl = value;
            }
        }

        return lastUrl;
    };

    const dispose = () => {
        revoke();
        lastSource = null;
        lastUrl = '';
    };

    return { resolve, dispose };
}