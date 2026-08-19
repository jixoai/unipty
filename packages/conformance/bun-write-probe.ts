import { createBunBackend } from "@unipty/backend-bun";
import type { BackendEndpoint, StructuredLaunch } from "unipty";

const backend = await createBunBackend();
const launch: StructuredLaunch = {
  argv: [process.execPath, "src/fixtures/echo-stream.mjs"],
  cols: 80, rows: 24,
};
const endpoint: BackendEndpoint = backend.spawn(launch);
const reader = endpoint.output.getReader();
(async () => { for(;;){ const {done} = await reader.read(); if (done) return; } })();
await new Promise(r => setTimeout(r, 800));

const CHUNK = 64 * 1024;
const payload = new Uint8Array(CHUNK).fill(0x62);
payload[CHUNK - 1] = 0x0a;
const start = Date.now();
for (let i = 0; i < 64; i++) {
  const ok = endpoint.write({ kind: "bytes", bytes: payload });
  if (!ok) {
    const t0 = Date.now();
    await endpoint.drain();
    console.log(`write #${i} returned false; drain recovered in ${Date.now() - t0}ms`);
  }
  if (Date.now() - start > 20000) { console.log("STALLED at write", i); process.exit(3); }
}
console.log("all 64 writes accepted in", Date.now() - start, "ms");
endpoint.terminate();
endpoint.close();
process.exit(0);
