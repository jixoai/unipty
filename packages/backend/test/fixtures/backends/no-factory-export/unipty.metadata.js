/** Side-effect-free test fixture metadata; never initializes a Backend. */
export default {
  schema: 1,
  package: { name: "@fixture/no-factory-export", version: "1.0.0" },
  backend: { id: "fixture-no-factory-export", factoryExport: "createBackend" },
  protocol: { core: [1] },
  targets: [{ runtime: "node" }],
};
