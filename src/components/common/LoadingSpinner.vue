<template>
    <span class="inline-block border-2 border-primary-400 border-t-transparent rounded-full animate-spin flex-shrink-0"
        :style="{ width: size + 'px', height: size + 'px' }" role="status" aria-label="loading"></span>
</template>

<script>
export default {
    props: {
        size: {
            type: Number,
            default: 16
        }
    }
};
</script>