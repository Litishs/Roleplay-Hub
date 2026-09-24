// Tailwind config for the novel workshop ("墨韵·造梦") standalone page.
// Compiled as the third pass of `npm run build:css` into assets/generated/novel.css.
// The page is a standalone entry (not processed by Vite), so its utility
// classes must be scanned here. daisyui is intentionally NOT included: the
// upstream page only uses core Tailwind utilities (it was built against the
// CDN runtime build). Per D8 (font decision) no webfont files are vendored —
// the stacks below mirror the page's --font-main/--font-art system stacks and
// fall back per device glyph.
module.exports = {
  content: ['./novel/index.html', './assets/js/novel-api-utils.js'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Noto Serif CJK SC"', '"Source Han Serif SC"', 'serif'],
        art: ['"Ma Shan Zheng"', '"Noto Serif SC"', '"Noto Serif CJK SC"', 'serif']
      }
    }
  }
};
