<script setup lang="ts">
import { ref } from 'vue';
import { useTooltipPosition } from './tooltip.ts';

defineProps<{ label: string; hint?: string; checked: boolean; disabled?: boolean }>();
const emit = defineEmits<{ change: [checked: boolean] }>();
const open = ref(false);
const anchor = ref<HTMLElement | null>(null);
const bubble = ref<HTMLElement | null>(null);
useTooltipPosition(anchor, bubble, open);
</script>
<template>
  <label
    ref="anchor"
    class="tk-switch tts-toggle"
    :class="{ 'is-disabled': disabled }"
    :title="hint || label"
    @mouseenter="open = true"
    @mouseleave="open = false"
    @focusin="open = true"
    @focusout="open = false"
    @keydown.esc="open = false"
  >
    <input class="tk-switch__input" type="checkbox" role="switch" :checked="checked" :disabled="disabled" :aria-label="label" @change="emit('change', ($event.target as HTMLInputElement).checked)">
    <span class="tk-switch__track" aria-hidden="true"><span class="tk-switch__thumb"></span></span>
    <span class="tk-switch__text tts-toggle__label">{{ label }}</span>
    <span v-if="hint && open" ref="bubble" class="tts-tooltip__bubble" role="tooltip" style="visibility: hidden">{{ hint }}</span>
  </label>
</template>
