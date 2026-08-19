(globalThis.__uniptyFixtureImports ??= []).push("@fixture/not-ready");

export async function createBackend() {
  return { spawned: false };
}
