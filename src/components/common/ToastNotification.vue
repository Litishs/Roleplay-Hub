<template>
    <!-- Toast Notification Container -->
    <div
        class="fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none items-center">
        <transition-group name="list" tag="div" class="toast-stack flex flex-col items-center gap-2">
            <div v-for="toast in toasts" :key="toast.id"
                class="pointer-events-auto flex items-center px-6 py-3 rounded-full shadow-lg border bg-white text-gray-800 min-w-[300px] transform backdrop-blur-sm bg-opacity-95 toast-item"
                :class="{
                    'border-green-200 text-green-800 bg-green-50': toast.type === 'success',
                    'border-red-200 text-red-800 bg-red-50': toast.type === 'error',
                    'border-blue-200 text-blue-800 bg-blue-50': toast.type === 'info',
                    'border-yellow-200 text-yellow-800 bg-yellow-50': toast.type === 'warning'
                 }">
                <div class="mr-3">
                    <svg v-if="toast.type === 'success'" class="w-6 h-6 text-green-500" fill="none"
                        stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7">
                        </path>
                    </svg>
                    <svg v-if="toast.type === 'error'" class="w-6 h-6 text-red-500" fill="none"
                        stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                    <svg v-if="toast.type === 'info'" class="w-6 h-6 text-blue-500" fill="none"
                        stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <svg v-if="toast.type === 'warning'" class="w-6 h-6 text-yellow-500" fill="none"
                        stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z">
                        </path>
                    </svg>
                </div>
                <div class="flex-1 text-sm">{{ toast.message }}</div>
            </div>
        </transition-group>
    </div>
</template>

<script>
import { inject } from "vue";
export default {
  setup() {
    const ctx = inject("appContext");
    return ctx || {};
  }
};
</script>