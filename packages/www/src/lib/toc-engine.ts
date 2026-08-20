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
 * data-family="<id>" spanning their whole family extent.
 */

export type TocWeights = ReadonlyMap<string, number>;

export interface TocEngineUpdate {
  weights: TocWeights;
  pick: string | null;
  /** Whole-family extents (parents) for spine/tick surfaces. */
  familyWeights: TocWeights;
}

export interface TocLineOptions {
  /** Distance from the viewport top to the calculation line, in px.
   *  Desktop default 1; mobile default 76 (sticky bar 44 + 2em). */
  lineOffset?: number;
}

export function createTocEngine(
  onUpdate: (update: TocEngineUpdate) => void,
  options: TocLineOptions = {},
): () => void {
  const lineOffset = options.lineOffset ?? 1;
  const regions = Array.from(document.querySelectorAll<HTMLElement>("[data-region]"));
  const families = Array.from(document.querySelectorAll<HTMLElement>("[data-family]"));
  let raf = 0;
  let lastKey = "";

  const iomWeight = (rect: DOMRect, vw: number, vh: number): number => {
    const interW = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
    const interH = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    if (interW <= 0 || interH <= 0) return 0;
    const inter = interW * interH;
    const min = Math.min(rect.width * rect.height, vw * vh);
    return min > 0 ? Math.min(1, inter / min) : 0;
  };

  const compute = (): void => {
    raf = 0;
    const vw = innerWidth;
    const vh = innerHeight;
    const line = lineOffset;
    const weights = new Map<string, number>();
    const familyWeights = new Map<string, number>();

    for (const el of families) {
      const w = iomWeight(el.getBoundingClientRect(), vw, vh);
      if (w > 0) familyWeights.set(el.dataset.family!, w);
    }
    // Weights visit EVERY block — the pick loop exits early, this loop must
    // not (an early exit once zeroed every block below the line even when
    // fully visible).
    for (const el of regions) {
      const w = iomWeight(el.getBoundingClientRect(), vw, vh);
      if (w > 0) weights.set(el.dataset.region!, w);
    }

    let pick: string | null =
      regions.length > 0 ? regions[regions.length - 1]!.dataset.region! : null;
    for (const el of regions) {
      if (el.getBoundingClientRect().bottom > line) {
        pick = el.dataset.region!;
        break;
      }
    }

    const key =
      pick +
      "|" +
      [...weights.entries()]
        .map(([k, v]) => k + v.toFixed(2))
        .sort()
        .join(",");
    if (key !== lastKey) {
      lastKey = key;
      onUpdate({ weights, pick, familyWeights });
    }
  };

  const schedule = (): void => {
    if (!raf) raf = requestAnimationFrame(compute);
  };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule, { passive: true });
  compute();
  return () => {
    removeEventListener("scroll", schedule);
    removeEventListener("resize", schedule);
    if (raf) cancelAnimationFrame(raf);
  };
}
