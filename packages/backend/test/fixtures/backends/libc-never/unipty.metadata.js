/** Side-effect-free test fixture metadata; never initializes a Backend. */
export default {
  schema: 1,
  package: { name: "@fixture/libc-never", version: "1.0.0" },
  backend: { id: "fixture-libc-never", factoryExport: "createBackend" },
  protocol: { core: [1] },
  targets: [{ runtime: "node", libc: ["__never_libc__"] }],
};
