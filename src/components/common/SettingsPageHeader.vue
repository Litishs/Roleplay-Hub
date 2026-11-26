<template>
  <div class="settings-page-header rph-glass rph-acrylic">
    <div class="flex items-center">
      <!-- Narrow screens get a Back arrow instead of the old menu button: these
           pages are detail views now (tab-navigation.mjs). Hidden on wide
           screens, where the left sidebar is the navigation. -->
      <button v-if="back" type="button" @click="$emit('back')" class="settings-back-button" aria-label="返回">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
        </svg>
      </button>
      <h2 class="text-xl md:text-2xl font-bold text-gray-800 flex items-center">
        <slot name="icon"></slot>
        {{ title }}
        <slot name="title-extra"></slot>
      </h2>
    </div>
    <div v-if="$slots.default" class="flex space-x-2 md:space-x-3">
      <slot></slot>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    title: String,
    // Root tab pages (工坊 / 扩展) pass false: there is nothing to go back to.
    back: { type: Boolean, default: true }
  },
  emits: ['back']
}
</script>
