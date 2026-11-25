// The theme palette is split per utility family (background / border / text)
// because the same gray step maps to different charcoal values depending on
// what it paints: bg-gray-100 is the raised surface (#212121) while
// border-gray-100 is the softer edge (#262626). Values live in
// assets/css/tokens.css and are defined as "R G B" triplets so opacity
// modifiers (/50, /70) keep working.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./index.html', './assets/js/**/*.js', './src/**/*.{vue,js,mjs}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--app-font-family)', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Microsoft YaHei', 'Noto Sans SC', 'Arial', 'sans-serif'],
        serif: ['var(--app-font-serif)', 'Lora', 'Noto Serif SC', 'Source Han Serif SC', 'STSong', 'SimSun', 'Georgia', 'serif']
      },
      colors: {
        primary: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa',
          500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a'
        }
      },
      backgroundColor: {
        // white is the card surface: flips to the charcoal card in dark mode.
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
        // Glass highlights painted over images/colored surfaces: never invert.
        overlay: {
          white: token('overlay-white'),
          black: token('overlay-black')
        }
      },
      borderColor: {
        // Glass edges over covers/avatars: stays white in both themes.
        white: token('border-white'),
        gray: {
          100: token('border-gray-100'),
          200: token('border-gray-200'),
          300: token('border-gray-300')
        }
      },
      textColor: {
        // Labels on accent surfaces: stays white in both themes.
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
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'fadeIn 0.3s ease-out',
        'slide-down': 'fadeIn 0.3s ease-out',
        'bounce-slow': 'bounce 1.5s infinite'
      },
      keyframes: { fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } } },
      transitionTimingFunction: { 'modal-fade': 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
      boxShadow: {
        soft: '0 4px 6px -1px rgba(0,0,0,.05), 0 2px 4px -1px rgba(0,0,0,.03)',
        card: '0 0 0 1px rgba(0,0,0,.03), 0 2px 8px rgba(0,0,0,.04)'
      }
    }
  },
  plugins: []
};