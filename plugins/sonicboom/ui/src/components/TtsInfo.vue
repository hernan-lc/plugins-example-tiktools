<script setup lang="ts">
import { ref } from 'vue';
import TtsIcon from './TtsIcon.vue';
import { useTooltipPosition } from './tooltip.ts';

/**
 * Minimal inline help: an info icon that reveals its text on hover, focus or
 * press. Keeps long explanations out of the card body while staying
 * keyboard-accessible (Escape dismisses it).
 */
const props = defineProps<{ text: string; label?: string }>();
const open = ref(false);
const anchor = ref<HTMLElement | null>(null);
const bubble = ref<HTMLElement | null>(null);
useTooltipPosition(anchor, bubble, open);
</script>

<template>
  <span
    ref="anchor"
    class="tts-info"
    @mouseenter="open = true"
    @mouseleave="open = false"
    @focusin="open = true"
    @focusout="open = false"
    @keydown.esc="open = false"
  >
    <button
      type="button"
      class="tts-info__trigger"
      :aria-label="label || text"
      :aria-expanded="open"
      @click="open = !open"
    >
      <TtsIcon name="info"/>
    </button>
    <span v-if="open" ref="bubble" class="tts-tooltip__bubble" role="tooltip" style="visibility: hidden">{{ props.text }}</span>
  </span>
</template>
