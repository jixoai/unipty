// Page data seam for the docs ToC (jixoai-ui 0.3.0, 2026-09-06): the root
// layout's chrome snippet composes the registry Toc tree from this data —
// structure lives in the layout, data stays serializable across the load
// boundary (the ui-site pattern). Ids match the section/h3 anchors in
// docs-page.svelte (locale-invariant). The en route serves the en labels;
// the /zh/ mirror route serves zh labels with the same ids.
import { en } from "$lib/i18n/locales/en";

export function load(): { toc: typeof en.docs.toc } {
  return { toc: en.docs.toc };
}
