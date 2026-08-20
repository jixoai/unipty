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
      crawl: false,
      entries: ["/", "/docs", "/compatibility"],
    },
  },
};

export default config;
