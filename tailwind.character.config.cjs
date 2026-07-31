module.exports = {
  content: ['./character/index.html', './assets/js/card-utils.js', './assets/js/ui-select.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--app-font-family)', 'ui-sans-serif', 'system-ui', 'Microsoft YaHei', 'Arial', 'sans-serif'],
        serif: ['var(--app-font-serif)', 'Lora', 'Noto Serif SC', 'STSong', 'SimSun', 'Georgia', 'serif']
      }
    }
  },
  plugins: [require('daisyui')],
  daisyui: { themes: true, logs: false }
};
