/** Side-effect-free test fixture metadata; never initializes a Backend. */
export default {
  schema: 1,
  package: { name: "@fixture/arch-broad", version: "1.0.0" },
  backend: { id: "fixture-arch-broad", factoryExport: "createBackend" },
  protocol: { core: [1] },
  targets: [
    {
      runtime: "node",
      arch: ["arm64", "x64", "ia32", "arm", "loong64", "ppc64", "riscv64", "s390x"],
    },
  ],
};
