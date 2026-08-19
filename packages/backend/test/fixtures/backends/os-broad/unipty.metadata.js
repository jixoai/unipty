/** Side-effect-free test fixture metadata; never initializes a Backend. */
export default {
  schema: 1,
  package: { name: "@fixture/os-broad", version: "1.0.0" },
  backend: { id: "fixture-os-broad", factoryExport: "createBackend" },
  protocol: { core: [1] },
  targets: [{ runtime: "node", os: ["darwin", "linux", "win32", "android", "freebsd", "openbsd", "sunos", "aix"] }],
};
