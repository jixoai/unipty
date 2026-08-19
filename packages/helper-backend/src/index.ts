/**
> Orthogonal intents (2026-08-20): @unipty/helper-backend public entry — the
 * pure manifest-module source generator and its CLI surface.
 *
 * Original request (2026-08-17): a build/development helper outside the
 * `@unipty/backend-*` runtime namespace. It generates explicit Backend
 * manifest modules from ordered candidate inputs and never becomes an
 * application runtime dependency.
 */

export { generateUniPtyBackendManifestModule } from "./generate.ts";
export { UniPtyHelperCandidateError } from "./generate.ts";
export type {
  GenerateUniPtyBackendManifestModuleOptions,
} from "./generate.ts";
export { main } from "./cli.ts";
export type { CliIo } from "./cli.ts";
