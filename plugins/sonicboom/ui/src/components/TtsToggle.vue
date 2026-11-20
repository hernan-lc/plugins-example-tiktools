<script setup lang="ts">
import { ref, useId } from 'vue';
import TtsIcon from './TtsIcon.vue';
defineProps<{ label: string; hint?: string; checked: boolean; disabled?: boolean }>();
const emit = defineEmits<{ change: [checked: boolean] }>();
const id = useId();
const dismissed = ref(false);
</script>
<template>
  <label class="tk-switch tts-toggle" :class="{ 'is-disabled': disabled, 'is-hint-dismissed': dismissed }" :title="hint || label" @keydown.esc="dismissed = true" @mouseleave="dismissed = false" @focusout="dismissed = false">
    <input class="tk-switch__input" type="checkbox" role="switch" :checked="checked" :disabled="disabled" :aria-label="label" :aria-describedby="hint ? id : undefined" @change="emit('change', ($event.target as HTMLInputElement).checked)">
    <span class="tk-switch__track" aria-hidden="true"><span class="tk-switch__thumb"></span></span>
    <span class="tk-switch__text tts-toggle__label">{{ label }}</span>
    <TtsIcon v-if="hint" name="info" class="tts-toggle__info"/>
    <span v-if="hint" :id="id" class="tts-toggle__hint" role="tooltip">{{ hint }}</span>
  </label>
</template>
