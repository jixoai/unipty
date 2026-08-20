/**
 * jixoai motion law, pattern 1 — scroll reveal entrance.
 *
 * Initial-state law (motion.md section 0): the pre-animation hidden state
 * lives in the prerendered markup. Callers MUST pair `use:reveal` with a
 * static `data-reveal` (or `data-reveal="rule"`) attribute in the template —
 * this action never adds or removes that attribute. Content stays visible
 * without JS (prerendered/no-JS output), under reduced motion, or where no
 * IntersectionObserver exists.
 */
export interface RevealOptions {
  /** Transition delay in milliseconds; used to stagger sibling entrances. */
  delay?: number;
  /** Rise distance in pixels for the default variant. */
  rise?: number;
}

export function reveal(node: HTMLElement, options: RevealOptions = {}): { destroy: () => void } {
  if (options.delay !== undefined) {
    node.style.setProperty("--reveal-delay", `${options.delay}ms`);
  }
  if (options.rise !== undefined) {
    node.style.setProperty("--reveal-rise", `${options.rise}px`);
  }

  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion || typeof IntersectionObserver === "undefined") {
    node.classList.add("is-revealed");
    return { destroy: () => undefined };
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          node.classList.add("is-revealed");
          observer.unobserve(node);
        }
      }
    },
    // threshold must be 0 (first-pixel entry): an IO threshold is a ratio OF
    // the element, so any non-zero value couples reveal timing to element
    // height (tall cards stay hidden while already visible). Edge buffering
    // is controlled only through rootMargin (viewport %, element-size-independent).
    { threshold: 0, rootMargin: "0px 0px -6% 0px" },
  );
  observer.observe(node);
  return { destroy: () => observer.disconnect() };
}
