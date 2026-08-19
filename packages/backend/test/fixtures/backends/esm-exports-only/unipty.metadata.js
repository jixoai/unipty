/** Side-effect-free test fixture metadata; never initializes a Backend. */
export default {
  schema: 1,
  package: { name: "@fixture/esm-exports-only", version: "1.0.0" },
  backend: { id: "fixture-esm-exports-only", factoryExport: "createBackend" },
  protocol: { core: [1] },
  targets: [{ runtime: "node" }],
};
