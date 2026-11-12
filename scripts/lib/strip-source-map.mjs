import { copyFile, readFile, writeFile } from 'node:fs/promises';

// Third-party UMD/minified bundles end with a `sourceMappingURL` comment, but
// their .map files are never copied next to the vendored copy. Vite's dev
// server honours that comment, fails to read the map and prints
// "Failed to load source map ... ENOENT" on every page load, which buries real
// errors in the console. The maps are build-time only here (nothing debugs a
// vendored bundle inside the app), so drop the trailing reference while copying
// instead of shipping megabytes of maps into assets/vendor.
const TRAILING_LINE_COMMENT = /[ \t]*\/\/# sourceMappingURL=\S+[ \t]*(?:\r?\n)?$/;
const TRAILING_BLOCK_COMMENT = /[ \t]*\/\*# sourceMappingURL=[\s\S]*?\*\/[ \t]*(?:\r?\n)?$/;

export const stripSourceMapComment = (source) => String(source)
    .replace(TRAILING_LINE_COMMENT, '')
    .replace(TRAILING_BLOCK_COMMENT, '');

export const copyWithoutSourceMap = async (sourcePath, destinationPath) => {
    if (!/\.(?:m?js|css)$/i.test(destinationPath)) {
        await copyFile(sourcePath, destinationPath);
        return;
    }
    const content = await readFile(sourcePath, 'utf8');
    await writeFile(destinationPath, stripSourceMapComment(content), 'utf8');
};
