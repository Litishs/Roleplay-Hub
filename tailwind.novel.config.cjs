// Tailwind config for the novel workshop ("墨韵·造梦") standalone page.
// Compiled as the third pass of `npm run build:css` into assets/generated/novel.css.
// The page is a standalone entry (not processed by Vite), so its utility
// classes must be scanned here. daisyui is intentionally NOT included: the
// upstream page only uses core Tailwind utilities (it was built against the
// CDN runtime build). Per D8 (font decision) no webfont files are vendored —
// the stacks below mirror the page's --font-main/--font-art system stacks and
// fall back per device glyph.
//
// P3 wiring (2026-11-26): same neutral token mapping as the character page.
// The page is light-only and loads tokens.css in its head, so the (light)
// triplets resolve identically to the old raw palette values. The page's own
// canvas tint (#f5f5f0/#2c2c2c) stays in its inline <style>: it is the page's
// art direction, deliberately different from the app canvas, and does not
// belong in the shared token file.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./novel/index.html', './assets/js/novel-api-utils.js'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Noto Serif CJK SC"', '"Source Han Serif SC"', 'serif'],
        art: ['"Ma Shan Zheng"', '"Noto Serif SC"', '"Noto Serif CJK SC"', 'serif']
      },
      backgroundColor: {
        white: token('bg-surface'),
        gray: {
          50: token('bg-gray-50'),
          100: token('bg-gray-100'),
          200: token('bg-gray-200'),
          300: token('bg-gray-300')
        },
        primary: {
          50: token('bg-primary-50'),
          100: token('bg-primary-100')
        },
        overlay: {
          white: token('overlay-white'),
          black: token('overlay-black')
        }
      },
      borderColor: {
        white: token('border-white'),
        gray: {
          100: token('border-gray-100'),
          200: token('border-gray-200'),
          300: token('border-gray-300')
        }
      },
      textColor: {
        white: token('text-white'),
        gray: {
          300: token('text-gray-300'),
          400: token('text-gray-400'),
          500: token('text-gray-500'),
          600: token('text-gray-600'),
          700: token('text-gray-700'),
          800: token('text-gray-800'),
          900: token('text-gray-900')
        },
        primary: {
          600: token('text-primary-600'),
          700: token('text-primary-700')
        }
      }
    }
  }
};
