/** Side-effect-free test fixture metadata; never initializes a Backend. */
export default {
  schema: 1,
  package: { name: "@fixture/import-fails", version: "1.0.0" },
  backend: { id: "fixture-import-fails", factoryExport: "createBackend" },
  protocol: { core: [1] },
  targets: [{ runtime: "node" }],
};
