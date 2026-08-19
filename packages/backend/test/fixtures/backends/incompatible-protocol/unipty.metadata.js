/** Side-effect-free test fixture metadata; never initializes a Backend. */
export default {
  schema: 1,
  package: { name: "@fixture/incompatible-protocol", version: "1.0.0" },
  backend: { id: "fixture-incompatible-protocol", factoryExport: "createBackend" },
  protocol: { core: [99] },
  targets: [{ runtime: "node" }],
};
