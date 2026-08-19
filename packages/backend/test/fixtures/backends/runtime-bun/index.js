(globalThis.__uniptyFixtureImports ??= []).push("@fixture/runtime-bun");

export async function createBackend() {
  return {
    spawn() {
      throw new Error("fixture backend cannot spawn");
    },
    async dispose() {},
  };
}
