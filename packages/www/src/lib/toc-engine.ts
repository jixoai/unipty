/**
 * jixoai ToC geometry engine (registry/files/lib/toc-engine.ts).
 *
 * One rAF-throttled scroll/resize pass reads live rects ONCE and derives
 * everything from that single snapshot (no IntersectionObserver callbacks:
 * no stale tops, no engine drift):
 *
 * - weights (Owner formula, 2026-08-20) — IoM:
 *   intersection area / min(block area, viewport area). Saturates to 1 in
 *   BOTH directions: block fully inside viewport, or viewport fully inside
 *   block. Multiple on-screen blocks highlight simultaneously,
 *   proportionally, and objectively.
 * - pick — the line algorithm: ONE line (viewport top on desktop; the
 *   sticky bar bottom + 2em = 76px on mobile, equal to the anchors'
 *   scroll-margin-top so a ToC tap picks the tapped entry immediately).
 *   Line-in-margin law: a line in the margin between blocks belongs to the
 *   block BELOW (blockC); past every region, the last region keeps the
 *   marker.
 *
 * Content contract: leaf entries are NON-OVERLAPPING heading-to-heading
 * blocks carrying data-region="<id>"; parent sections carry
 * data-family="<id>" spanning their whole family extent. ALTERNATIVE
 * region source (2026-08-22, scroll-area family): the `extents` option —
 * derived heading extents from the toc-outline lib, no data-region markup
 * (rects synthesized start.top → end.top at compute time; the getter is
 * re-read every pass, so re-derivations are live).
 */

export type TocWeights = ReadonlyMap<string, number>;

export interface TocEngineUpdate {
  weights: TocWeights;
  pick: string | null;
  /** Whole-family extents (parents) for spine/tick surfaces. */
  familyWeights: TocWeights;
}

/** A derived-outline region (the toc-outline lib): a heading-to-heading
 *  extent without data-region markup. The rect is synthesized as
 *  start.top → end.top (full viewport width) at compute time. */
export interface TocExtent {
  id: string;
  /** the heading element — the region START */
  start: Element;
  /** the next same-or-higher heading — the region END boundary
   *  (exclusive); null/omitted = to content end (saturates). */
  end?: Element | null;
}

/** rect fields the IoM math reads — DOMRect or the synthesized extent rect */
type RectLike = Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width' | 'height'>;

export interface TocLineOptions {
  /** Distance from the viewport top to the calculation line, in px.
   *  Static number or a live getter (re-evaluated each compute — for
   *  overlay shells whose header/float geometry is measured, not
   *  hardcoded). Desktop default 1; mobile default 76. */
  lineOffset?: number | (() => number);
  /** Scroll root for overlay-shell layouts where an internal element
   *  scrolls instead of the document. Accepts an element or a selector
   *  resolved at engine creation. Defaults to the window/document. */
  scrollRoot?: string | HTMLElement | null;
  /** Derived-outline region source (pairs with the toc-outline lib).
   *  When provided, region geometry comes from the heading extents INSTEAD
   *  of [data-region] elements (mutually exclusive sources — never double
   *  count); [data-family] observation is untouched. The getter is re-read
   *  every compute, so a re-derivation is picked up live without an engine
   *  restart. */
  extents?: () => readonly TocExtent[];
}

export function createTocEngine(
  onUpdate: (update: TocEngineUpdate) => void,
  options: TocLineOptions = {},
): () => void {
  const lineOffset = options.lineOffset ?? 1;
  const scrollRootEl =
    typeof options.scrollRoot === 'string'
      ? document.querySelector<HTMLElement>(options.scrollRoot)
      : (options.scrollRoot ?? null);
  const scrollListenerTarget: HTMLElement | Window = scrollRootEl ?? window;
  const regions = Array.from(document.querySelectorAll<HTMLElement>('[data-region]'));
  const families = Array.from(document.querySelectorAll<HTMLElement>('[data-family]'));
  let raf = 0;
  let lastKey = '';

  const iomWeight = (rect: RectLike, vw: number, vh: number): number => {
    const interW = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
    const interH = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    if (interW <= 0 || interH <= 0) return 0;
    const inter = interW * interH;
    const min = Math.min(rect.width * rect.height, vw * vh);
    return min > 0 ? Math.min(1, inter / min) : 0;
  };

  // derived-extent rect: start.top → end.top, full viewport width; a
  // missing end saturates past the viewport (the last region extends to
  // content end, capping its IoM at 1 exactly like the data-region law)
  const extentRect = (extent: TocExtent, vw: number, vh: number): RectLike => {
    const top = extent.start.getBoundingClientRect().top;
    const bottom = extent.end ? extent.end.getBoundingClientRect().top : vh + 1;
    return { top, bottom, left: 0, right: vw, width: vw, height: Math.max(0, bottom - top) };
  };

  const compute = (): void => {
    raf = 0;
    const vw = innerWidth;
    const vh = innerHeight;
    const line = typeof lineOffset === 'function' ? lineOffset() : lineOffset;
    const weights = new Map<string, number>();
    const familyWeights = new Map<string, number>();

    for (const el of families) {
      const w = iomWeight(el.getBoundingClientRect(), vw, vh);
      if (w > 0) familyWeights.set(el.dataset.family!, w);
    }

    // region source: derived extents when provided, [data-region]
    // otherwise — mutually exclusive, never double counted
    const extents = options.extents?.() ?? null;
    const regionRects: Array<readonly [string, RectLike]> = extents
      ? extents.map((extent) => [extent.id, extentRect(extent, vw, vh)] as const)
      : regions.map((el) => [el.dataset.region!, el.getBoundingClientRect()] as const);

    // Weights visit EVERY block — the pick loop exits early, this loop must
    // not (an early exit once zeroed every block below the line even when
    // fully visible).
    for (const [id, rect] of regionRects) {
      const w = iomWeight(rect, vw, vh);
      if (w > 0) weights.set(id, w);
    }

    let pick: string | null = regionRects.length > 0 ? regionRects[regionRects.length - 1]![0] : null;
    for (const [id, rect] of regionRects) {
      if (rect.bottom > line) {
        pick = id;
        break;
      }
    }

    const key =
      pick +
      '|' +
      [...weights.entries()].map(([k, v]) => k + v.toFixed(2)).sort().join(',');
    if (key !== lastKey) {
      lastKey = key;
      onUpdate({ weights, pick, familyWeights });
    }
  };

  const schedule = (): void => {
    if (!raf) raf = requestAnimationFrame(compute);
  };
  scrollListenerTarget.addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  compute();
  return () => {
    scrollListenerTarget.removeEventListener('scroll', schedule);
    removeEventListener('resize', schedule);
    if (raf) cancelAnimationFrame(raf);
  };
}
