<script setup lang="ts">
defineProps<{ label: string; hint?: string; checked: boolean; disabled?: boolean }>();
const emit = defineEmits<{ change: [checked: boolean] }>();
</script>
<template>
  <!-- The hint stays a native title: a custom tooltip overlapped neighbouring
       controls and was unreliable inside the plugin WebView. -->
  <label class="tk-switch tts-toggle" :class="{ 'is-disabled': disabled }" :title="hint || label">
    <input class="tk-switch__input" type="checkbox" role="switch" :checked="checked" :disabled="disabled" :aria-label="label" @change="emit('change', ($event.target as HTMLInputElement).checked)">
    <span class="tk-switch__track" aria-hidden="true"><span class="tk-switch__thumb"></span></span>
    <span class="tk-switch__text tts-toggle__label">{{ label }}</span>
  </label>
</template>
