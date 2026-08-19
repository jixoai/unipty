(globalThis.__uniptyFixtureImports ??= []).push("@fixture/good-b");

export async function createBackend() {
  return {
    spawn() {
      throw new Error("fixture backend cannot spawn");
    },
    async dispose() {},
  };
}
