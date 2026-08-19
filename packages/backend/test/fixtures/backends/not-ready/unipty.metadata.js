/** Side-effect-free test fixture metadata; never initializes a Backend. */
export default {
  schema: 1,
  package: { name: "@fixture/not-ready", version: "1.0.0" },
  backend: { id: "fixture-not-ready", factoryExport: "createBackend" },
  protocol: { core: [1] },
  targets: [{ runtime: "node" }],
};
