(globalThis.__uniptyFixtureImports ??= []).push("@fixture/incompatible-protocol");

export async function createBackend() {
  return {
    spawn() {
      throw new Error("fixture backend cannot spawn");
    },
    async dispose() {},
  };
}
