(globalThis.__uniptyFixtureImports ??= []).push("@fixture/metadata-throws");

export async function createBackend() {
  return {
    spawn() {
      throw new Error("fixture backend cannot spawn");
    },
    async dispose() {},
  };
}
