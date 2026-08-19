/** Side-effect-free test fixture metadata; never initializes a Backend. */
export default {
  schema: 1,
  package: { name: "@fixture/libc-linux-glibc", version: "1.0.0" },
  backend: { id: "fixture-libc-linux-glibc", factoryExport: "createBackend" },
  protocol: { core: [1] },
  targets: [{ runtime: "node", os: ["linux"], libc: ["glibc"] }],
};
