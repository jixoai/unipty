// Copyright 2018-2026 the Deno authors. MIT license.
// Copyright the Browserify authors. MIT License.

import { fromFileUrl } from "../../path/1.1.6/from_file_url.ts";

/**
 * Convert a URL or string to a path.
 *
 * @param pathUrl A URL or string to be converted.
 *
 * @returns The path as a string.
 */
export function toPathString(
  pathUrl: string | URL,
): string {
  return pathUrl instanceof URL ? fromFileUrl(pathUrl) : pathUrl;
}
