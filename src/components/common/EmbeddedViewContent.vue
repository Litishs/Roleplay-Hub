<template>
  <button @click="$emit('menu')"
    class="md:hidden absolute left-0 top-1/2 transform -translate-y-1/2 z-20 pl-2 pr-1.5 py-3 bg-white/90 backdrop-blur-md text-gray-600 text-xs font-medium rounded-r-xl shadow-lg border border-l-0 border-gray-200 active:scale-95 transition-all flex flex-col items-center gap-1">
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
    </svg>
    <span class="leading-none">返</span>
    <span class="leading-none">回</span>
  </button>
  <div class="flex-1 w-full relative bg-white h-full">
    <div v-if="loading" class="absolute inset-0 z-10 flex items-center justify-center bg-gray-50">
      <div class="flex flex-col items-center">
        <svg class="embedded-loading-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle class="embedded-loading-spinner__track" cx="12" cy="12" r="9"></circle>
          <circle class="embedded-loading-spinner__arc" cx="12" cy="12" r="9"></circle>
        </svg>
        <div class="text-gray-500 font-medium">{{ loadingText }}</div>
      </div>
    </div>
    <iframe :src="src" @load="$emit('load')" class="absolute inset-0 w-full h-full border-0"
      allow="clipboard-write"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"></iframe>
  </div>
</template>

<script>
export default {
  props: {
    src: String,
    loading: Boolean,
    loadingText: String
  },
  emits: ['load', 'menu']
}
</script>
