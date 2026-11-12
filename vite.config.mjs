import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

console.log('[vite.config.mjs] LOADED. Alias vue ->', fileURLToPath(new URL('./node_modules/vue/dist/vue.esm-bundler.js', import.meta.url)))

export default defineConfig({
  base: '',

  plugins: [vue()],
  resolve: {
    alias: {
      // Unify root app + SFC components onto the same Vue build that includes
      // the runtime template compiler. Previously index.html #app template was
      // compiled by the global UMD Vue (vue.global.prod.js) while .vue SFCs
      // used Vite-bundled ESM Vue, causing duplicate reactive systems:
      // provide/inject would fail across the boundary and root template
      // ref mutations would not trigger SFC child renders.
      'vue': fileURLToPath(new URL('./node_modules/vue/dist/vue.esm-bundler.js', import.meta.url)),
    }
  },
  optimizeDeps: {
    // Exclude vue from pre-bundling so the resolve.alias ALWAYS wins.
    // Without this, Vite's optimizer may pre-bundle the default runtime-only
    // entry point from package.json "module" field before the alias is applied.
    exclude: ['vue'],
  },
  server: {
    // Only src/, index.html, assets/ and the standalone pages belong to the
    // dev module graph. The rest of the tree is build output, device test
    // notes, or the toolchain — and .toolchains/ alone is ~35k files (JDK +
    // Android SDK). Recursive watching all of it on Windows stalls Vite's
    // event loop in multi-second bursts: an idle reload of `/` measured 1-50s
    // with the watcher on versus ~5ms with these directories ignored.
    // Irrelevant changes also triggered spurious full-reloads.
    watch: {
      ignored: [
        // Keep Vite's own defaults, since an explicit list replaces them.
        '**/.git/**',
        '**/node_modules/**',
        '**/.toolchains/**',
        '**/android/**',
        '**/dist/**',
        '**/debug_apk/**',
        '**/documents/**',
        '**/.zcode/**',
        '**/.mimosa/**',
        '**/.openclaw*/**',
      ],
    },
  },
  define: {
    // vue.esm-bundler.js expects these feature flags at compile time
    __VUE_OPTIONS_API__: JSON.stringify(true),
    __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false),
    __VUE_PROD_SOURCES__: JSON.stringify(false),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/main-[hash].js',
        chunkFileNames: 'assets/chunk-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
})
