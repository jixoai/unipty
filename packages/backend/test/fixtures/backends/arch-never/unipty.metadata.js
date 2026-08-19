/** Side-effect-free test fixture metadata; never initializes a Backend. */
export default {
  schema: 1,
  package: { name: "@fixture/arch-never", version: "1.0.0" },
  backend: { id: "fixture-arch-never", factoryExport: "createBackend" },
  protocol: { core: [1] },
  targets: [{ runtime: "node", arch: ["__never_arch__"] }],
};
