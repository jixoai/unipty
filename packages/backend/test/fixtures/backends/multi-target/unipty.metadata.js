/** Side-effect-free test fixture metadata; never initializes a Backend. */
export default {
  schema: 1,
  package: { name: "@fixture/multi-target", version: "1.0.0" },
  backend: { id: "fixture-multi-target", factoryExport: "createBackend" },
  protocol: { core: [1] },
  targets: [{ runtime: "bun" }, { runtime: "deno" }],
};
