(globalThis.__uniptyFixtureImports ??= []).push("@fixture/esm-exports-only");

export async function createBackend() {
  return {
    spawn() {
      throw new Error("fixture backend cannot spawn");
    },
    async dispose() {},
  };
}
