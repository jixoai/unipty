# Tasks: zigpty Windows soft support + adapter disk spool

## 1. Adapter

- [x] New `packages/backend-zigpty/src/output-spool.ts`: record format
      `[kind][uint32 length][payload]`, bounded memory head, lazy spill
      file (append + read fds, monotonic read offset), FIFO replay,
      idempotent close/unlink, typed spill/read failures.
- [x] `ZigptyBackendOptions.outputSpool?: true | { memoryBytes?, directory? }`
      with `invalid-argument` validation (mirror `writeQueueBytes`);
      defaults 1 MiB / `os.tmpdir()`; snapshot at readiness like the other
      options.
- [x] Endpoint integration: `onData` appends to the spool and schedules a
      microtask pump; `pull()` also pumps; pump moves records only while
      `desiredSize > 0`; transport-EOF triggers request completion
      (pending flag drains the tail before closing); `close()` and
      cancellation drop spool content and delete the temp file.
- [x] Remove the `process.platform === "win32"` factory gate; keep the
      `hasNative` hard gate; update class-level law comments.
- [x] `unipty.metadata.ts`: targets widen to `[{ runtime: "node" }]` with
      a comment tying Windows presentation to evidence gating.

## 2. Tests

- [x] `test/output-spool.spec.ts`: FIFO across the spill boundary, text
      multibyte round-trip per record, bytes records, bounded head after
      flush, interleaved append/read, close deletes the file, read/write
      past EOF returns undefined.
- [x] `test/endpoint.spec.ts`: flood with a slow reader and tiny
      `memoryBytes` delivers every byte in order and cleans the spill
      directory; fast-exit tail fully delivered before completion when
      spooled; explicit `close()` drops and cleans; completion waits for
      a stalled reader to drain the spool.
- [x] `test/metadata.spec.ts`: targets assertion updated to the widened
      declaration.
- [x] Full battery + `check:arch` + fmt + build + typecheck green.

## 3. Docs / surfaces

- [x] Adapter README ± zh: replace the Windows fail-closed section with
      soft-support semantics; document `outputSpool` (usage, defaults,
      sync-IO note, unbounded-disk note, temp-file lifetime).
- [x] Root README ± zh capability matrix: zigpty Windows and
      kernel-backpressure cells reworded; spool mentioned in the notes
      column.
- [x] www locales (en/zh) capability matrix: same reclassification.
- [x] Workspace `AGENTS.md` and `.scratch/unipty-v1/spec.md`: zigpty
      paragraph updated (soft support + spool law).
- [x] Example worker factory enables `outputSpool: true` for the zigpty
      tab so the acceptance path exercises the change.

## 4. Verification / release (delivery workflow)

- [ ] Local installed-profile re-run for the zigpty route (macOS).
- [ ] Codex review round (herdr, async callback pattern); process
      findings and re-verify.
- [ ] Example end-to-end acceptance by the Owner, docs review.
- [ ] Only then: archive change, version bump, release.
- [ ] Follow-up (out of scope, tracked): conformance scripts win32
      portability (`fileURLToPath`, fixtures) to unlock Windows CI cells
      and verified evidence.
