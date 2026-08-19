(globalThis.__uniptyFixtureImports ??= []).push("@fixture/libc-never");

export async function createBackend() {
  return {
    spawn() {
      throw new Error("fixture backend cannot spawn");
    },
    async dispose() {},
  };
}
