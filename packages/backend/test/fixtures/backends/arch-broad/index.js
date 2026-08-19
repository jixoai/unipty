(globalThis.__uniptyFixtureImports ??= []).push("@fixture/arch-broad");

export async function createBackend() {
  return {
    spawn() {
      throw new Error("fixture backend cannot spawn");
    },
    async dispose() {},
  };
}
