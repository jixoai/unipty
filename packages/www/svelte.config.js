import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess({ script: true }),
  kit: {
    adapter: adapter({ pages: "dist", assets: "dist", strict: true }),
    prerender: {
      // Flat multi-page artifact: links point at real files (/docs.html) and
      // the catalog is copied after the build, so there is nothing to crawl.
      // Route dirs carry the .html suffix themselves (showcase law), so the
      // SPA client router resolves the same URLs the flat files serve.
      // 2026-09-06 site-i18n-zh: /zh/ mirrors join the explicit entries
      // ('/zh/' with its trailing slash — the zh index's trailingSlash
      // 'always' artifact is the directory index dist/zh/index.html).
      crawl: false,
      entries: [
        "/",
        "/docs.html",
        "/compatibility.html",
        "/zh/",
        "/zh/docs.html",
        "/zh/compatibility.html",
      ],
    },
  },
};

export default config;
