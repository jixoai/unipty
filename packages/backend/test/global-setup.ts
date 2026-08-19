/**
> Orthogonal intents (2026-08-20): one-time acquisition test environment
 * setup — links fixture Backends into fixture consumers before any worker
 * starts, so parallel test files never race on `node_modules`.
 */

import { linkFixtureBackends } from "./setup.ts";

export function setup(): void {
  linkFixtureBackends();
}
