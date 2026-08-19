/** Side-effect-free test fixture metadata; never initializes a Backend. */
export default {
  schema: 1,
  package: { name: "@fixture/os-never", version: "1.0.0" },
  backend: { id: "fixture-os-never", factoryExport: "createBackend" },
  protocol: { core: [1] },
  targets: [{ runtime: "node", os: ["__never_os__"] }],
};
