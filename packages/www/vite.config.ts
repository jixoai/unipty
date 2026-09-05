// Orthogonal intents (maintained 2026-09-06; original request: 更新官网站点
// 到 jixoai-ui 0.3.0):
// 1. One vite pipeline for dev/build (sveltekit + tailwindcss v4 css-first).
//    The AI export layer is NOT a plugin here — this site's build is
//    orchestrated (scripts/build.mjs injects the catalog + stylesheet after
//    vite), so the llms-txt law puts generation in the orchestrator's final
//    step, never a second plugin.
// 2. Dev server pinned to port 13500 (unique per concurrent agent law).
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  server: { port: 13500 },
});
