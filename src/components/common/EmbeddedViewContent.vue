<template>
  <!-- Full-bleed embedded page: the only exit on narrow screens is this floating
       Back ball (the workshop is a detail view; there is no title bar). It
       starts at the right edge, vertically centred, and can be dragged anywhere
       inside the page. A tap (or keyboard activation) goes back; a drag only
       moves it. -->
  <!-- Deliberately solid, not .rph-glass: the ball floats over an iframe, and a
       backdrop-filter there forces cross-document composition every frame
       (design doc §3.3 note / §14.3). -->
  <button type="button" ref="ball" aria-label="返回"
    class="embedded-back-ball"
    :class="{ 'is-positioned': dragPosition, 'is-dragging': dragging }"
    :style="dragPosition ? { left: dragPosition.left + 'px', top: dragPosition.top + 'px' } : null"
    @pointerdown="onPointerDown" @pointermove="onPointerMove"
    @pointerup="onPointerUp" @pointercancel="onPointerCancel"
    @click="onClick">
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
    </svg>
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
// A pointer travel below this is still a tap: fingers wobble a few pixels.
const DRAG_THRESHOLD = 6;
// Keep the ball fully inside the page, clear of the physical edges.
const EDGE_GAP = 8;

export default {
  props: {
    src: String,
    loading: Boolean,
    loadingText: String
  },
  emits: ['load', 'back'],
  data() {
    return {
      dragging: false,
      // null = default CSS position (right edge, vertically centred).
      dragPosition: null,
      drag: null,
      suppressClick: false
    };
  },
  mounted() {
    window.addEventListener('resize', this.clampToHost);
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.clampToHost);
    this.drag = null;
  },
  methods: {
    hostElement() {
      return this.$refs.ball?.offsetParent || null;
    },
    clampToHost() {
      if (!this.dragPosition) return;
      const ball = this.$refs.ball;
      const host = this.hostElement();
      if (!ball || !host) return;
      this.dragPosition = {
        left: Math.min(this.dragPosition.left, Math.max(EDGE_GAP, host.clientWidth - ball.offsetWidth - EDGE_GAP)),
        top: Math.min(this.dragPosition.top, Math.max(EDGE_GAP, host.clientHeight - ball.offsetHeight - EDGE_GAP))
      };
    },
    onPointerDown(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const ball = this.$refs.ball;
      const host = this.hostElement();
      if (!ball || !host) return;
      const ballRect = ball.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      this.drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: ballRect.left - hostRect.left,
        top: ballRect.top - hostRect.top,
        moved: false
      };
      this.dragging = true;
      try {
        ball.setPointerCapture(event.pointerId);
      } catch {}
    },
    onPointerMove(event) {
      const drag = this.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      const ball = this.$refs.ball;
      const host = this.hostElement();
      if (!ball || !host) return;
      const maxLeft = Math.max(EDGE_GAP, host.clientWidth - ball.offsetWidth - EDGE_GAP);
      const maxTop = Math.max(EDGE_GAP, host.clientHeight - ball.offsetHeight - EDGE_GAP);
      this.dragPosition = {
        left: Math.min(Math.max(EDGE_GAP, drag.left + dx), maxLeft),
        top: Math.min(Math.max(EDGE_GAP, drag.top + dy), maxTop)
      };
    },
    onPointerUp(event) {
      const drag = this.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      this.drag = null;
      this.dragging = false;
      try {
        this.$refs.ball?.releasePointerCapture(event.pointerId);
      } catch {}
      // A drag that happens to end on the ball still fires click; swallow it.
      if (drag.moved) {
        this.suppressClick = true;
        setTimeout(() => { this.suppressClick = false; }, 0);
      }
    },
    onPointerCancel(event) {
      const drag = this.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      this.drag = null;
      this.dragging = false;
    },
    onClick() {
      if (this.suppressClick) return;
      this.$emit('back');
    }
  }
};
</script>
