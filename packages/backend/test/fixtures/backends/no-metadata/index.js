(globalThis.__uniptyFixtureImports ??= []).push("@fixture/no-metadata");

export async function createBackend() {
  return {
    spawn() {
      throw new Error("fixture backend cannot spawn");
    },
    async dispose() {},
  };
}
