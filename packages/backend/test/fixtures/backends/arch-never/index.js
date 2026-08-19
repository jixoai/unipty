(globalThis.__uniptyFixtureImports ??= []).push("@fixture/arch-never");

export async function createBackend() {
  return {
    spawn() {
      throw new Error("fixture backend cannot spawn");
    },
    async dispose() {},
  };
}
