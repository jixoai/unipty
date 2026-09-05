/**
 * jixoai ToC outline derivation (registry/files/lib/toc-outline.ts).
 *
 * 2026-08-22 · Scroll-area family, request 3 (Owner): "ToC 所需的元数据导
 * 出" — the framework-free half of automatic ToC linkage. Today every page
 * hand-writes the same id 3–4 times (tocSections literal + wrapper id +
 * data-region/data-family) and every label twice. This lib derives the
 * outline FROM the content itself: scan heading levels, slugify labels,
 * stamp the ids back (fragment links need a real id), and expose each
 * entry's EXTENT (heading → next same-or-higher heading) for the geometry
 * engine's extents provider — no data-region markup, no DOM restructuring
 * (moving nodes at runtime would break Svelte ownership; extents are the
 * sanctioned route).
 *
 * Pairs with: toc-engine's `extents` option (weights/pick over derived
 * extents) and toc.svelte's `outline` prop (zero-handwritten-id ToC).
 * Framework-free by the lib law: DOM in, plain data out, zero listeners.
 */

export interface TocOutlineEntry {
  /** fragment id — the heading's existing id, or the slugified label
   *  (stamped back onto the heading so `href="#id"` resolves natively) */
  id: string;
  /** trimmed heading text */
  label: string;
  /** heading level (2 for h2, 3 for h3 …) */
  level: number;
  /** the heading element — the region START */
  start: Element;
  /** the next heading of level <= this entry's level: the region END
   *  boundary (exclusive). null for the last entry (extent = to content
   *  end — the engine saturates it against the viewport). */
  end: Element | null;
}

export interface TocOutlineOptions {
  /** heading levels that join the outline, default [2, 3].
   *  Values outside 1–6 are dropped; the minimum present level becomes the
   *  section tier and everything deeper collapses into child entries. */
  levels?: readonly number[];
}

/**
 * Derive the outline from `root`'s heading tree. DOM order is the outline
 * order (querySelectorAll is document order). Headings inside an element
 * carrying data-toc-skip (or the heading itself) are skipped. Idempotent:
 * derived slugs stamp onto the headings, so re-derivation (content
 * mutation, HMR) yields the same ids.
 */
export function deriveTocOutline(root: ParentNode, options: TocOutlineOptions = {}): TocOutlineEntry[] {
  const levels = [...new Set((options.levels ?? [2, 3]).filter((l) => l >= 1 && l <= 6))].sort(
    (a, b) => a - b,
  );
  if (levels.length === 0) return [];
  const selector = levels.map((l) => `h${l}`).join(',');
  const used = new Set<string>();
  const headings = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.closest('[data-toc-skip]'),
  );

  const slugOf = (label: string, index: number): string => {
    const slug = label
      .toLowerCase()
      // ascii-slugs only: CJK and friends collapse to nothing, so keep a
      // positional fallback (stable across re-derivation for static content)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const base = slug || `section-${index + 1}`;
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };

  const entries: TocOutlineEntry[] = [];
  headings.forEach((el, i) => {
    const level = Number(el.tagName.slice(1));
    const label = (el.textContent ?? '').trim();
    const id = el.id !== '' && !used.has(el.id) ? (used.add(el.id), el.id) : slugOf(label, i);
    // stamp derived ids back: ToC links are real fragment anchors
    if (el.id !== id) el.id = id;
    // extent end = next heading at same or higher level (smaller number)
    let end: Element | null = null;
    for (let j = i + 1; j < headings.length; j++) {
      if (Number(headings[j]!.tagName.slice(1)) <= level) {
        end = headings[j]!;
        break;
      }
    }
    entries.push({ id, label, level, start: el, end });
  });
  return entries;
}

export interface TocOutlineSection {
  id: string;
  label: string;
  children?: { id: string; label: string }[];
}

/**
 * Collapse outline entries into toc.svelte's `sections` shape: minimum
 * present level = sections, deeper levels collapse into the preceding
 * section's children (two tiers, the ToC surface contract).
 */
export function tocOutlineToSections(entries: readonly TocOutlineEntry[]): TocOutlineSection[] {
  if (entries.length === 0) return [];
  const sectionLevel = Math.min(...entries.map((e) => e.level));
  const sections: TocOutlineSection[] = [];
  for (const entry of entries) {
    if (entry.level === sectionLevel) {
      sections.push({ id: entry.id, label: entry.label });
    } else {
      const parent = sections[sections.length - 1];
      // a deeper heading with no section above it (levels: [3] alone, or a
      // stray h3 before the first h2) becomes its own section — never lost
      if (!parent) sections.push({ id: entry.id, label: entry.label });
      else (parent.children ??= []).push({ id: entry.id, label: entry.label });
    }
  }
  return sections;
}
