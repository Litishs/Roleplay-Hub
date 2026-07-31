module.exports = {
  content: ['./index.html', './assets/js/**/*.js'],
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
