/** Invalid test fixture metadata: wrong schema and duplicate protocol majors. */
export default {
  schema: 2,
  package: { name: "@fixture/bad-metadata", version: "1.0.0" },
  backend: { id: "fixture-bad-metadata", factoryExport: "createBackend" },
  protocol: { core: [1, 1] },
  targets: [{ runtime: "node" }],
};
