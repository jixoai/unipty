/** Side-effect-free test fixture metadata; never initializes a Backend. */
export default {
  schema: 1,
  package: { name: "@fixture/factory-throws", version: "1.0.0" },
  backend: { id: "fixture-factory-throws", factoryExport: "createBackend" },
  protocol: { core: [1] },
  targets: [{ runtime: "node" }],
};
