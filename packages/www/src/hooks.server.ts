// Orthogonal intents (maintained 2026-09-06 Asia/Shanghai): the only server
// hook — render-time substitution of the root element's lang attribute
// placeholder (src/app.html) with the route's locale ('/zh/**' mirrors → zh,
// everything else including '/' → en). Prerendering goes through the same
// handle pipeline, so the static artifacts carry the right lang attribute;
// chunks without the placeholder pass through untouched (streaming-safe).
//
// Original request (2026-09-06 Asia/Shanghai): openspec/changes/
// 2026-09-06-site-i18n-zh — per-locale lang attribute; pattern adopted from
// the openspecui bilingual site (the pre-registry hand-written reference
// the language-switcher is composed after).
import type { Handle } from "@sveltejs/kit";
import { base } from "$app/paths";
import { localeOfRoute, routeOfPath } from "$lib/i18n/content";

// The placeholder literal is intentionally split so this comment can name it
// without ever containing it: replaceAll (not first-match replace) — if the
// placeholder ever appears again later in a document (e.g. inside a comment),
// no earlier accidental hit can steal the root element's substitution, and
// every occurrence resolves consistently.
const LANG_PLACEHOLDER = "%" + "lang" + "%";

export const handle: Handle = async ({ event, resolve }) => {
  const lang = localeOfRoute(routeOfPath(event.url.pathname, base));
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replaceAll(LANG_PLACEHOLDER, lang),
  });
};
