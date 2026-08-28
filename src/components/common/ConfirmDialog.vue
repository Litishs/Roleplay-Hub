<template>
    <!-- Theme-compliant Global Confirm Modal -->
    <transition enter-active-class="transition duration-300 ease-modal-fade" enter-from-class="opacity-0"
        enter-to-class="opacity-100" leave-active-class="transition duration-200 ease-in"
        leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="globalConfirmModal.show" class="fixed inset-0 z-[200] flex items-center justify-center px-4 pt-4 pb-20 text-center sm:p-0">
            <div class="fixed inset-0 bg-black/40 backdrop-blur-[2px]"></div>
            <div class="bg-white rounded-2xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.15)] transform transition-transform w-full max-w-sm overflow-hidden relative z-10 border border-gray-100 p-6 flex flex-col items-center animate-slide-up">
                <div class="w-12 h-12 rounded-full bg-yellow-50 flex items-center justify-center mb-4 border border-yellow-100 shadow-sm">
                    <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                    </svg>
                </div>
                <h3 class="text-lg font-bold text-gray-900 mb-2 tracking-tight">{{ globalConfirmModal.title }}</h3>
                <p class="text-[13px] text-gray-500 mb-6 whitespace-pre-wrap leading-relaxed px-2">{{ globalConfirmModal.message }}</p>
                <div class="flex space-x-3 w-full">
                    <button @click="globalConfirmModal.onCancel" class="flex-1 py-2.5 px-4 bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold rounded-xl transition-all border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-300 hover:-translate-y-0.5">
                        取消中断
                    </button>
                    <button @click="globalConfirmModal.onConfirm" class="flex-1 py-2.5 px-4 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-primary-400 hover:-translate-y-0.5">
                        立即重试
                    </button>
                </div>
            </div>
        </div>
    </transition>

    <!-- Confirmation Modal -->
    <div v-if="showConfirmModal"
        class="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
        <div
            class="bg-white rounded-xl border border-gray-200 w-full max-w-sm flex flex-col shadow-2xl transform transition-all scale-100">
            <div class="p-6 text-center">
                <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                    <svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h3 class="text-lg font-medium text-gray-900 mb-2">确认操作</h3>
                <p class="text-sm text-gray-500 whitespace-pre-wrap" v-html="confirmMessage"></p>
            </div>
            <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse rounded-b-xl">
                <button @click="handleConfirm" type="button"
                    class="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm transition-colors">
                    确认
                </button>
                <button @click="handleCancel" type="button"
                    class="mt-3 w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm transition-colors">
                    取消
                </button>
            </div>
        </div>
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
