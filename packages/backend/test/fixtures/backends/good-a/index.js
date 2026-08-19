(globalThis.__uniptyFixtureImports ??= []).push("@fixture/good-a");

export async function createBackend() {
  return {
    spawn() {
      throw new Error("fixture backend cannot spawn");
    },
    async dispose() {},
  };
}
