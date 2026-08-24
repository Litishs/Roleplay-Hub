<template>
  <div class="flex items-center gap-1.5 text-[11px] text-gray-500 font-mono bg-white/50 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/50 animate-fade-in mt-1 shadow-sm typing-timer-badge">
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
    </svg>
    <span class="whitespace-nowrap">
      {{ waitTime }}s
      <span v-if="estimatedTime || remoteEstimatedTime" class="text-gray-300 mx-0.5">/</span>
      <span v-if="estimatedTime && !remote">{{ estimatedTime }}s</span>
      <span v-else-if="remoteEstimatedTime">{{ remoteEstimatedTime }}s</span>
    </span>
  </div>
</template>

<script>
export default {
  props: {
    waitTime: Number,
    estimatedTime: Number,
    remoteEstimatedTime: Number,
    remote: Boolean
  }
}
</script>
