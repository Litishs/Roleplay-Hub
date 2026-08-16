import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Downloads the pinned sherpa-onnx Android AAR (onnxruntime + neural TTS JNI
// bindings) into android/app/libs/ so build.gradle can pick it up via fileTree.
// The AAR is a build-time binary artifact and is NOT tracked by git.
//
// Env overrides:
//   SHERPA_ONNX_AAR_URL     full URL override (highest priority)
//   SHERPA_ONNX_MIRROR_URL  mirror prefix, e.g. https://ghproxy.com/https://github.com

const SHERPA_ONNX_VERSION = '1.13.5';
const DEFAULT_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_ONNX_VERSION}/sherpa-onnx-${SHERPA_ONNX_VERSION}.aar`;
const EXPECTED_SIZE_BYTES = 49095090; // exact size of the pinned AAR, guards against truncated downloads
const MIN_SIZE_BYTES = 10 * 1024 * 1024;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const libsDir = path.join(rootDir, 'android', 'app', 'libs');
const aarPath = path.join(libsDir, 'sherpa-onnx.aar');

const resolveUrl = () => {
    if (process.env.SHERPA_ONNX_AAR_URL) return process.env.SHERPA_ONNX_AAR_URL;
    if (process.env.SHERPA_ONNX_MIRROR_URL) {
        return `${String(process.env.SHERPA_ONNX_MIRROR_URL).replace(/\/+$/, '')}/${DEFAULT_URL}`;
    }
    return DEFAULT_URL;
};

const isZipFile = async (filePath) => {
    const handle = await import('node:fs').then((fs) => fs.promises.open(filePath, 'r'));
    try {
        const buffer = Buffer.alloc(2);
        await handle.read(buffer, 0, 2, 0);
        return buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK"
    } finally {
        await handle.close();
    }
};

const download = async (url) => {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok || !response.body) {
        throw new Error(`download failed: HTTP ${response.status} for ${url}`);
    }
    await pipeline(response.body, createWriteStream(aarPath));
};

const main = async () => {
    if (existsSync(aarPath) && statSync(aarPath).size >= MIN_SIZE_BYTES && await isZipFile(aarPath)) {
        const size = statSync(aarPath).size;
        if (process.env.SHERPA_ONNX_AAR_URL || size === EXPECTED_SIZE_BYTES) {
            console.log(`[prepare-local-tts] sherpa-onnx.aar already present (${(size / 1048576).toFixed(1)} MB), skip download`);
            return;
        }
        console.warn(`[prepare-local-tts] existing file has unexpected size ${size} (expected ${EXPECTED_SIZE_BYTES}), re-downloading`);
    }
    mkdirSync(libsDir, { recursive: true });
    const url = resolveUrl();
    console.log(`[prepare-local-tts] downloading sherpa-onnx ${SHERPA_ONNX_VERSION} AAR ...`);
    console.log(`[prepare-local-tts] url: ${url}`);
    try {
        await download(url);
    } catch (error) {
        console.error(`[prepare-local-tts] ERROR: ${error.message}`);
        console.error('[prepare-local-tts] set SHERPA_ONNX_MIRROR_URL (ghproxy-style prefix) or SHERPA_ONNX_AAR_URL and retry');
        process.exit(1);
    }
    const size = statSync(aarPath).size;
    if (size < MIN_SIZE_BYTES || !(await isZipFile(aarPath))) {
        console.error(`[prepare-local-tts] ERROR: downloaded file looks invalid (${size} bytes), removing`);
        const fs = await import('node:fs');
        fs.rmSync(aarPath, { force: true });
        process.exit(1);
    }
    console.log(`[prepare-local-tts] saved android/app/libs/sherpa-onnx.aar (${(size / 1048576).toFixed(1)} MB)`);
};

main();
