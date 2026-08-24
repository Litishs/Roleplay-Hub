<template>
  <div class="settings-page-header">
    <div class="flex items-center">
      <button @click="$emit('menu')" class="mobile-menu-button">
        <svg class="w-6 h-6" fill="none" stroke="currentColor"><use href="#icon-menu"></use></svg>
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
    title: String
  },
  emits: ['menu']
}
</script>
