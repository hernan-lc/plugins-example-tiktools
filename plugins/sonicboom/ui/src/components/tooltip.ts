import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from 'vue';

/**
 * Places a tooltip bubble in viewport coordinates, clamped to the visible
 * area. Anchoring it with absolute positioning inside a card let long hints
 * overflow the panel and get clipped; `position: fixed` + clamping keeps the
 * bubble fully inside the WebView regardless of the card's scroll container.
 */
export function useTooltipPosition(
  trigger: Ref<HTMLElement | null>,
  bubble: Ref<HTMLElement | null>,
  open: Ref<boolean>,
): void {
  const MARGIN = 8;
  const GAP = 6;

  const place = (): void => {
    const anchor = trigger.value;
    const tip = bubble.value;
    if (!open.value || !anchor || !tip) return;
    const rect = anchor.getBoundingClientRect();
    const size = tip.getBoundingClientRect();
    const maxLeft = Math.max(MARGIN, window.innerWidth - size.width - MARGIN);
    const left = Math.min(Math.max(MARGIN, rect.left), maxLeft);
    let top = rect.bottom + GAP;
    if (top + size.height > window.innerHeight - MARGIN) {
      top = Math.max(MARGIN, rect.top - size.height - GAP);
    }
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.style.visibility = 'visible';
  };

  watch(open, () => { void nextTick(place); });
  onMounted(() => {
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
  });
}
