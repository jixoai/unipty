(globalThis.__uniptyFixtureImports ??= []).push("@fixture/libc-linux-glibc");

export async function createBackend() {
  return {
    spawn() {
      throw new Error("fixture backend cannot spawn");
    },
    async dispose() {},
  };
}
