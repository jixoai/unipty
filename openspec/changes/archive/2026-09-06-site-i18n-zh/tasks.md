## 1. Site locale surface

- [x] 1.1 `/` = en (unchanged URLs); `/zh/` mirrors of index,
      compatibility.html, docs.html with copy from README-zh.md; catalog
      evidence strings stay verbatim (artifact data, not prose); `<html lang>`
      per locale; hreflang alternates (en/zh/x-default).
- [x] 1.2 `npx jixoai-ui add language-switcher` (one item, verify disk
      landed), wire into the header; switcher preserves the current
      page/anchor across locales.
- [x] 1.3 llms export covers both locales (build.mjs orchestration step);
      re-run builds byte-identical.

## 2. Check suite

- [x] 2.1 Extend `scripts/check-site.mjs`: zh pages in link check,
      three-state render, responsive smoke, llms export shape — both fixtures,
      both CNAME modes, all green.

## 3. Wrap

- [x] 3.1 NOTES.md deviations updated (incl. any flat-html/locale export
      caveats); friction log reported.
