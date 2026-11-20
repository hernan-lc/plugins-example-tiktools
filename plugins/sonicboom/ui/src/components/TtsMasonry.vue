<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUpdated, ref } from 'vue';

/**
 * Dependency-free masonry for the plugin WebView. Grid rows are 4px tall and
 * each card spans as many rows as it measures, so cards pack into the first
 * free slot (the shortest column) without reordering the DOM. Unlike CSS
 * multi-column, a tall first card cannot leave the last column half empty.
 */
const ROW = 4;
const GAP = 16;
const host = ref<HTMLElement | null>(null);
let observer: ResizeObserver | undefined;
let frame = 0;

const measure = (): void => {
  const el = host.value;
  if (!el) return;
  for (const child of Array.from(el.children) as HTMLElement[]) {
    const span = Math.max(1, Math.ceil((child.getBoundingClientRect().height + GAP) / ROW));
    const value = `span ${span}`;
    if (child.style.gridRowEnd !== value) child.style.gridRowEnd = value;
  }
};
const schedule = (): void => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(measure);
};
const observe = (): void => {
  observer?.disconnect();
  if (!host.value) return;
  observer = new ResizeObserver(schedule);
  observer.observe(host.value);
  for (const child of host.value.children) observer.observe(child);
  schedule();
};

onMounted(observe);
// Cards can appear, disappear or change height (disclosures, logs, locale).
onUpdated(observe);
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  observer?.disconnect();
});
</script>

<template>
  <div ref="host" class="tts-masonry"><slot/></div>
</template>
