// Tailwind config for the character workshop standalone page (not processed by
// Vite; compiled as the second pass of `npm run build:css` into
// assets/generated/character.css).
//
// P3 wiring (2026-11-26): neutral utility colors resolve through the shared
// design tokens in assets/css/tokens.css instead of the raw Tailwind palette,
// so the page cannot drift from the main app's palette. The page is light-only
// by decision (§2.2 problem B of the theme plan): it never sets
// data-theme='dark' — and must not, because that attribute name would also
// activate daisyui's own dark theme (rename it to data-daisy-theme first if
// that is ever wanted).
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./character/index.html', './assets/js/card-utils.js', './assets/js/ui-select.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--app-font-family)', 'ui-sans-serif', 'system-ui', 'Microsoft YaHei', 'Arial', 'sans-serif'],
        serif: ['var(--app-font-serif)', 'Lora', 'Noto Serif SC', 'STSong', 'SimSun', 'Georgia', 'serif']
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
  },
  plugins: [require('daisyui')],
  daisyui: { themes: true, logs: false }
};
