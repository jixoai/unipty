/** Side-effect-free test fixture metadata; never initializes a Backend. */
export default {
  schema: 1,
  package: { name: "@fixture/runtime-bun", version: "1.0.0" },
  backend: { id: "fixture-runtime-bun", factoryExport: "createBackend" },
  protocol: { core: [1] },
  targets: [{ runtime: "bun" }],
};
