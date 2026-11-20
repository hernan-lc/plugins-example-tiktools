<script lang="tsx">
import { onBeforeUnmount, onMounted, onUpdated, ref } from 'vue';
import { defineVueComponent } from '../vue/component.ts';

/**
 * Dependency-free masonry for the plugin WebView. Grid rows are 4px tall and
 * each card spans as many rows as it measures, so cards pack into the first
 * free slot without moving DOM nodes between parents (which would remount
 * their local state). `row dense` backfills holes left by expanding cards.
 * Items marked `data-masonry-span="all"` form a full-width row.
 */
const ROW = 4;
const GAP = 16;

export const TtsMasonry = defineVueComponent<{ children?: unknown }>([], (props) => {
  const host = ref<HTMLElement | null>(null);
  let observer: ResizeObserver | undefined;
  let frame = 0;

  const measure = (): void => {
    const el = host.value;
    if (!el) return;
    for (const child of Array.from(el.children) as HTMLElement[]) {
      if (child.dataset.masonrySpan === 'all') child.style.gridColumn = '1 / -1';
      // Full-width rows need a row span too: without it their content would
      // overflow the 4px auto row and overlap the sections below the masonry.
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
    const el = host.value;
    if (!el) return;
    observer = new ResizeObserver(schedule);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    schedule();
  };

  onMounted(observe);
  // Card contents change height (disclosures, logs, locale, voices).
  onUpdated(observe);
  onBeforeUnmount(() => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
  });

  return () => <div ref={host} class="tts-masonry">{props.children}</div>;
});

export default TtsMasonry;
</script>
