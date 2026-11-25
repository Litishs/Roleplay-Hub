<template>
    <div class="secret-input relative">
        <input :type="visible ? 'text' : 'password'" :value="modelValue" :disabled="disabled"
            :placeholder="placeholder" :class="inputClass" autocomplete="off" autocapitalize="none"
            autocorrect="off" spellcheck="false" @input="onInput">
        <div class="secret-input__actions absolute right-1.5 top-0 bottom-0 flex items-center gap-1">
            <button type="button" class="secret-input__button" :title="copied ? '已复制' : '复制密钥'"
                :aria-label="copied ? '已复制' : '复制密钥'" @mousedown.prevent @click="copy">
                <svg v-if="!copied" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M8 7V5a2 2 0 012-2h7a2 2 0 012 2v9a2 2 0 01-2 2h-2M5 9h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2z">
                    </path>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
            </button>
            <button type="button" class="secret-input__button" :title="visible ? '隐藏密钥' : '显示密钥'"
                :aria-label="visible ? '隐藏密钥' : '显示密钥'" @mousedown.prevent @click="visible = !visible">
                <svg v-if="!visible" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z">
                    </path>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21">
                    </path>
                </svg>
            </button>
        </div>
    </div>
</template>

<script>
// Secret input for API keys: reveal + copy on demand, hidden again on blur.
// The value never leaves the field except through the clipboard — no logging,
// no analytics, no intermediate storage (AGENTS.md §2.4).
export default {
    props: {
        modelValue: { type: String, default: '' },
        placeholder: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        modelModifiers: { type: Object, default: () => ({}) },
        inputClass: {
            type: String,
            default: 'w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-16 text-gray-700 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 focus:outline-none transition-all'
        }
    },
    emits: ['update:modelValue'],
    data() {
        return { visible: false, copied: false, copiedTimer: null };
    },
    beforeUnmount() {
        if (this.copiedTimer) clearTimeout(this.copiedTimer);
    },
    methods: {
        onInput(event) {
            const value = this.modelModifiers.trim ? event.target.value.trim() : event.target.value;
            this.$emit('update:modelValue', value);
        },
        async copy() {
            const value = String(this.modelValue || '');
            if (!value) return;
            try {
                await navigator.clipboard.writeText(value);
            } catch {
                // Older WebViews: fall back to the hidden-textarea trick.
                const area = document.createElement('textarea');
                area.value = value;
                area.style.position = 'fixed';
                area.style.opacity = '0';
                document.body.appendChild(area);
                area.select();
                try { document.execCommand('copy'); } catch { /* nothing else to try */ }
                area.remove();
            }
            this.copied = true;
            if (this.copiedTimer) clearTimeout(this.copiedTimer);
            this.copiedTimer = setTimeout(() => { this.copied = false; }, 1200);
        }
    }
};
</script>