(globalThis.__uniptyFixtureImports ??= []).push("@fixture/bad-metadata");

export async function createBackend() {
  return {
    spawn() {
      throw new Error("fixture backend cannot spawn");
    },
    async dispose() {},
  };
}
