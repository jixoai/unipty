(globalThis.__uniptyFixtureImports ??= []).push("@fixture/factory-throws");

export async function createBackend() {
  throw new Error("fixture factory exploded");
}
