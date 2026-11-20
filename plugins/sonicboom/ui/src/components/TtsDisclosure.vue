<script setup lang="ts">
import { ref, useId, watch } from 'vue';
import TtsIcon from './TtsIcon.vue';

/**
 * Accessible disclosure built from a real button + aria-expanded, not
 * <details>/<summary>, whose native marker, box model and focus behaviour
 * cannot be styled consistently across the plugin WebViews.
 */
const props = withDefaults(defineProps<{
  title: string;
  icon?: string;
  expanded?: boolean;
  chevron?: boolean;
}>(), { expanded: false, chevron: true });

const emit = defineEmits<{ 'update:expanded': [value: boolean] }>();
const open = ref(props.expanded);
watch(() => props.expanded, value => { open.value = value; });

const bodyId = useId();
const toggle = (): void => {
  open.value = !open.value;
  emit('update:expanded', open.value);
};
</script>

<template>
  <div class="tts-disclosure" :class="{ 'is-open': open }">
    <button
      type="button"
      class="tts-disclosure__trigger"
      :aria-expanded="open"
      :aria-controls="bodyId"
      @click="toggle"
    >
      <TtsIcon v-if="icon" :name="icon" class="tts-disclosure__icon"/>
      <span class="tts-disclosure__title">{{ title }}</span>
      <TtsIcon v-if="chevron" name="chevron" class="tts-disclosure__chevron"/>
    </button>
    <div v-show="open" :id="bodyId" class="tts-disclosure__body" role="region" :aria-label="title">
      <slot/>
    </div>
  </div>
</template>
