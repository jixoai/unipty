//#region vendor/js/jsr.io/@std/internal/1.0.14/_os.ts
function checkWindows() {
  const global = globalThis;
  const platform = global.process?.platform;
  if (typeof platform === "string") return platform.startsWith("win");
  const os = global.Deno?.build?.os;
  if (typeof os === "string") return os === "windows";
  return global.navigator?.platform?.startsWith("Win") ?? false;
}
//#endregion
//#region vendor/js/jsr.io/@std/internal/1.0.14/os.ts
/** Whether the current platform is Windows */
const isWindows = checkWindows();
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/_common/assert_path.ts
function assertPath(path) {
  if (typeof path !== "string")
    throw new TypeError(`Path must be a string, received "${JSON.stringify(path)}"`);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/_common/from_file_url.ts
function assertArg$2(url) {
  url = url instanceof URL ? url : new URL(url);
  if (url.protocol !== "file:")
    throw new TypeError(`URL must be a file URL: received "${url.protocol}"`);
  return url;
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/posix/from_file_url.ts
/**
 * Converts a file URL to a path string.
 *
 * @example Usage
 * ```ts
 * import { fromFileUrl } from "@std/path/posix/from-file-url";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(fromFileUrl(new URL("file:///home/foo")), "/home/foo");
 * ```
 *
 * @param url The file URL to convert.
 * @returns The path string.
 */
function fromFileUrl$2(url) {
  url = assertArg$2(url);
  return decodeURIComponent(url.pathname.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"));
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/_common/strip_trailing_separators.ts
function stripTrailingSeparators(segment, isSep) {
  if (segment.length <= 1) return segment;
  let end = segment.length;
  for (let i = segment.length - 1; i > 0; i--)
    if (isSep(segment.charCodeAt(i))) end = i;
    else break;
  return segment.slice(0, end);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/posix/_util.ts
function isPosixPathSeparator$1(code) {
  return code === 47;
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/windows/_util.ts
function isPosixPathSeparator(code) {
  return code === 47;
}
function isPathSeparator(code) {
  return code === 47 || code === 92;
}
function isWindowsDeviceRoot(code) {
  return (code >= 97 && code <= 122) || (code >= 65 && code <= 90);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/windows/from_file_url.ts
/**
 * Converts a file URL to a path string.
 *
 * @example Usage
 * ```ts
 * import { fromFileUrl } from "@std/path/windows/from-file-url";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(fromFileUrl("file:///home/foo"), "\\home\\foo");
 * assertEquals(fromFileUrl("file:///C:/Users/foo"), "C:\\Users\\foo");
 * assertEquals(fromFileUrl("file://localhost/home/foo"), "\\home\\foo");
 * ```
 *
 * @param url The file URL to convert.
 * @returns The path string.
 */
function fromFileUrl$1(url) {
  url = assertArg$2(url);
  let path = decodeURIComponent(
    url.pathname.replace(/\//g, "\\").replace(/%(?![0-9A-Fa-f]{2})/g, "%25"),
  ).replace(/^\\*([A-Za-z]:)(\\|$)/, "$1\\");
  if (url.hostname !== "") path = `\\\\${url.hostname}${path}`;
  return path;
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/_common/dirname.ts
function assertArg$1(path) {
  assertPath(path);
  if (path.length === 0) return ".";
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/posix/dirname.ts
/**
 * Return the directory path of a `path`.
 *
 * @example Usage
 * ```ts
 * import { dirname } from "@std/path/posix/dirname";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(dirname("/home/user/Documents/"), "/home/user");
 * assertEquals(dirname("/home/user/Documents/image.png"), "/home/user/Documents");
 * assertEquals(dirname("https://deno.land/std/path/mod.ts"), "https://deno.land/std/path");
 * assertEquals(dirname(new URL("file:///home/user/Documents/image.png")), "/home/user/Documents");
 * ```
 *
 * @example Working with URLs
 *
 * Only `URL` instances with the `file:` protocol are accepted. To process a
 * non-`file:` URL, pass it as a string or pass its `pathname` property.
 *
 * ```ts
 * import { dirname } from "@std/path/posix/dirname";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(dirname("https://deno.land/std/path/mod.ts"), "https://deno.land/std/path");
 * assertEquals(dirname("https://deno.land/std/path/mod.ts?a=b"), "https://deno.land/std/path");
 * assertEquals(dirname("https://deno.land/std/path/mod.ts#header"), "https://deno.land/std/path");
 * assertEquals(dirname(new URL("https://deno.land/std/path/mod.ts").pathname), "/std/path");
 * ```
 *
 * @param path The path to get the directory from.
 * @returns The directory path.
 * @throws {TypeError} If `path` is a `URL` instance whose protocol is not `file:`.
 */
function dirname$2(path) {
  if (path instanceof URL) path = fromFileUrl$2(path);
  assertArg$1(path);
  let end = -1;
  let matchedNonSeparator = false;
  for (let i = path.length - 1; i >= 1; --i)
    if (isPosixPathSeparator$1(path.charCodeAt(i))) {
      if (matchedNonSeparator) {
        end = i;
        break;
      }
    } else matchedNonSeparator = true;
  if (end === -1) return isPosixPathSeparator$1(path.charCodeAt(0)) ? "/" : ".";
  return stripTrailingSeparators(path.slice(0, end), isPosixPathSeparator$1);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/windows/dirname.ts
/**
 * Return the directory path of a `path`.
 *
 * @example Usage
 * ```ts
 * import { dirname } from "@std/path/windows/dirname";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(dirname("C:\\foo\\bar\\baz.ext"), "C:\\foo\\bar");
 * assertEquals(dirname(new URL("file:///C:/foo/bar/baz.ext")), "C:\\foo\\bar");
 * ```
 *
 * @param path The path to get the directory from.
 * @returns The directory path.
 * @throws {TypeError} If `path` is a `URL` instance whose protocol is not `file:`.
 */
function dirname$1(path) {
  if (path instanceof URL) path = fromFileUrl$1(path);
  assertArg$1(path);
  const len = path.length;
  let rootEnd = -1;
  let end = -1;
  let matchedSlash = true;
  let offset = 0;
  const code = path.charCodeAt(0);
  if (len > 1) {
    if (isPathSeparator(code)) {
      rootEnd = offset = 1;
      if (isPathSeparator(path.charCodeAt(1))) {
        let j = 2;
        let last = j;
        for (; j < len; ++j) if (isPathSeparator(path.charCodeAt(j))) break;
        if (j < len && j !== last) {
          last = j;
          for (; j < len; ++j) if (!isPathSeparator(path.charCodeAt(j))) break;
          if (j < len && j !== last) {
            last = j;
            for (; j < len; ++j) if (isPathSeparator(path.charCodeAt(j))) break;
            if (j === len) return path;
            if (j !== last) rootEnd = offset = j + 1;
          }
        }
      }
    } else if (isWindowsDeviceRoot(code)) {
      if (path.charCodeAt(1) === 58) {
        rootEnd = offset = 2;
        if (len > 2) {
          if (isPathSeparator(path.charCodeAt(2))) rootEnd = offset = 3;
        }
      }
    }
  } else if (isPathSeparator(code)) return path;
  for (let i = len - 1; i >= offset; --i)
    if (isPathSeparator(path.charCodeAt(i))) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else matchedSlash = false;
  if (end === -1) {
    if (rootEnd === -1) return ".";
    else end = rootEnd;
  }
  return stripTrailingSeparators(path.slice(0, end), isPosixPathSeparator);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/dirname.ts
/**
 * Return the directory path of a path.
 *
 * @example Usage
 * ```ts
 * import { dirname } from "@std/path/dirname";
 * import { assertEquals } from "@std/assert";
 *
 * if (Deno.build.os === "windows") {
 *   assertEquals(dirname("C:\\home\\user\\Documents\\image.png"), "C:\\home\\user\\Documents");
 *   assertEquals(dirname(new URL("file:///C:/home/user/Documents/image.png")), "C:\\home\\user\\Documents");
 * } else {
 *   assertEquals(dirname("/home/user/Documents/image.png"), "/home/user/Documents");
 *   assertEquals(dirname(new URL("file:///home/user/Documents/image.png")), "/home/user/Documents");
 * }
 * ```
 *
 * @param path Path to extract the directory from. When passed as a `URL`
 * instance, its protocol must be `file:`. For other protocols, pass the URL
 * as a string or pass its `pathname` property.
 * @returns The directory path.
 * @throws {TypeError} If `path` is a `URL` instance whose protocol is not `file:`.
 */
function dirname(path) {
  return isWindows ? dirname$1(path) : dirname$2(path);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/posix/extname.ts
/**
 * Return the extension of the `path` with leading period.
 *
 * @example Usage
 * ```ts
 * import { extname } from "@std/path/posix/extname";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(extname("/home/user/Documents/file.ts"), ".ts");
 * assertEquals(extname("/home/user/Documents/"), "");
 * assertEquals(extname("/home/user/Documents/image.png"), ".png");
 * assertEquals(extname(new URL("file:///home/user/Documents/file.ts")), ".ts");
 * assertEquals(extname(new URL("file:///home/user/Documents/file.ts?a=b")), ".ts");
 * assertEquals(extname(new URL("file:///home/user/Documents/file.ts#header")), ".ts");
 * ```
 *
 * @example Working with URLs
 *
 * Only `URL` instances with the `file:` protocol are accepted. To process a
 * non-`file:` URL, pass it as a string or pass its `pathname` property.
 *
 * Note: This function doesn't automatically strip hash and query parts from
 * URLs. If your URL contains a hash or query, remove them before passing the
 * URL to the function. This can be done by passing the URL to `new URL(url)`,
 * and setting the `hash` and `search` properties to empty strings.
 *
 * ```ts
 * import { extname } from "@std/path/posix/extname";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(extname("https://deno.land/std/path/mod.ts"), ".ts");
 * assertEquals(extname("https://deno.land/std/path/mod.ts?a=b"), ".ts?a=b");
 * assertEquals(extname("https://deno.land/std/path/mod.ts#header"), ".ts#header");
 * assertEquals(extname(new URL("https://deno.land/std/path/mod.ts").pathname), ".ts");
 * ```
 *
 * @param path The path to get the extension from.
 * @returns The extension (ex. for `file.ts` returns `.ts`).
 * @throws {TypeError} If `path` is a `URL` instance whose protocol is not `file:`.
 */
function extname$2(path) {
  if (path instanceof URL) path = fromFileUrl$2(path);
  assertPath(path);
  let startDot = -1;
  let startPart = 0;
  let end = -1;
  let matchedSlash = true;
  let preDotState = 0;
  for (let i = path.length - 1; i >= 0; --i) {
    const code = path.charCodeAt(i);
    if (isPosixPathSeparator$1(code)) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }
    if (code === 46) {
      if (startDot === -1) startDot = i;
      else if (preDotState !== 1) preDotState = 1;
    } else if (startDot !== -1) preDotState = -1;
  }
  if (
    startDot === -1 ||
    end === -1 ||
    preDotState === 0 ||
    (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
  )
    return "";
  return path.slice(startDot, end);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/windows/extname.ts
/**
 * Return the extension of the `path` with leading period.
 *
 * @example Usage
 * ```ts
 * import { extname } from "@std/path/windows/extname";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(extname("file.ts"), ".ts");
 * assertEquals(extname(new URL("file:///C:/foo/bar/baz.ext")), ".ext");
 * ```
 *
 * @param path The path to get the extension from.
 * @returns The extension of the `path`.
 * @throws {TypeError} If `path` is a `URL` instance whose protocol is not `file:`.
 */
function extname$1(path) {
  if (path instanceof URL) path = fromFileUrl$1(path);
  assertPath(path);
  let start = 0;
  let startDot = -1;
  let startPart = 0;
  let end = -1;
  let matchedSlash = true;
  let preDotState = 0;
  if (path.length >= 2 && path.charCodeAt(1) === 58 && isWindowsDeviceRoot(path.charCodeAt(0)))
    start = startPart = 2;
  for (let i = path.length - 1; i >= start; --i) {
    const code = path.charCodeAt(i);
    if (isPathSeparator(code)) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }
    if (code === 46) {
      if (startDot === -1) startDot = i;
      else if (preDotState !== 1) preDotState = 1;
    } else if (startDot !== -1) preDotState = -1;
  }
  if (
    startDot === -1 ||
    end === -1 ||
    preDotState === 0 ||
    (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
  )
    return "";
  return path.slice(startDot, end);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/extname.ts
/**
 * Return the extension of the path with leading period (".").
 *
 * @example Usage
 * ```ts
 * import { extname } from "@std/path/extname";
 * import { assertEquals } from "@std/assert";
 *
 * if (Deno.build.os === "windows") {
 *   assertEquals(extname("C:\\home\\user\\Documents\\image.png"), ".png");
 *   assertEquals(extname(new URL("file:///C:/home/user/Documents/image.png")), ".png");
 * } else {
 *   assertEquals(extname("/home/user/Documents/image.png"), ".png");
 *   assertEquals(extname(new URL("file:///home/user/Documents/image.png")), ".png");
 * }
 * ```
 *
 * @param path Path with extension. When passed as a `URL` instance, its
 * protocol must be `file:`. For other protocols, pass the URL as a string or
 * pass its `pathname` property.
 * @returns The file extension. E.g. returns `.ts` for `file.ts`.
 * @throws {TypeError} If `path` is a `URL` instance whose protocol is not `file:`.
 */
function extname(path) {
  return isWindows ? extname$1(path) : extname$2(path);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/from_file_url.ts
/**
 * Converts a file URL to a path string.
 *
 * @example Usage
 * ```ts
 * import { fromFileUrl } from "@std/path/from-file-url";
 * import { assertEquals } from "@std/assert";
 *
 * if (Deno.build.os === "windows") {
 *   assertEquals(fromFileUrl("file:///home/foo"), "\\home\\foo");
 *   assertEquals(fromFileUrl("file:///C:/Users/foo"), "C:\\Users\\foo");
 *   assertEquals(fromFileUrl("file://localhost/home/foo"), "\\home\\foo");
 * } else {
 *   assertEquals(fromFileUrl("file:///home/foo"), "/home/foo");
 * }
 * ```
 *
 * @param url The file URL to convert to a path.
 * @returns The path string.
 */
function fromFileUrl(url) {
  return isWindows ? fromFileUrl$1(url) : fromFileUrl$2(url);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/posix/is_absolute.ts
/**
 * Verifies whether provided path is absolute.
 *
 * @example Usage
 * ```ts
 * import { isAbsolute } from "@std/path/posix/is-absolute";
 * import { assert, assertFalse } from "@std/assert";
 *
 * assert(isAbsolute("/home/user/Documents/"));
 * assertFalse(isAbsolute("home/user/Documents/"));
 * ```
 *
 * @param path The path to verify.
 * @returns Whether the path is absolute.
 */
function isAbsolute$2(path) {
  assertPath(path);
  return path.length > 0 && isPosixPathSeparator$1(path.charCodeAt(0));
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/windows/is_absolute.ts
/**
 * Verifies whether provided path is absolute.
 *
 * @example Usage
 * ```ts
 * import { isAbsolute } from "@std/path/windows/is-absolute";
 * import { assert, assertFalse } from "@std/assert";
 *
 * assert(isAbsolute("C:\\foo\\bar"));
 * assertFalse(isAbsolute("..\\baz"));
 * ```
 *
 * @param path The path to verify.
 * @returns `true` if the path is absolute, `false` otherwise.
 */
function isAbsolute$1(path) {
  assertPath(path);
  const len = path.length;
  if (len === 0) return false;
  const code = path.charCodeAt(0);
  if (isPathSeparator(code)) return true;
  else if (isWindowsDeviceRoot(code)) {
    if (len > 2 && path.charCodeAt(1) === 58) {
      if (isPathSeparator(path.charCodeAt(2))) return true;
    }
  }
  return false;
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/is_absolute.ts
/**
 * Verifies whether provided path is absolute.
 *
 * @example Usage
 * ```ts
 * import { isAbsolute } from "@std/path/is-absolute";
 * import { assert, assertFalse } from "@std/assert";
 *
 * if (Deno.build.os === "windows") {
 *   assert(isAbsolute("C:\\home\\foo"));
 *   assertFalse(isAbsolute("home\\foo"));
 * } else {
 *   assert(isAbsolute("/home/foo"));
 *   assertFalse(isAbsolute("home/foo"));
 * }
 * ```
 *
 * @param path Path to be verified as absolute.
 * @returns `true` if path is absolute, `false` otherwise
 */
function isAbsolute(path) {
  return isWindows ? isAbsolute$1(path) : isAbsolute$2(path);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/_common/normalize.ts
function assertArg(path) {
  assertPath(path);
  if (path.length === 0) return ".";
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/_common/normalize_string.ts
function normalizeString(path, allowAboveRoot, separator, isPathSeparator) {
  let res = "";
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code;
  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) code = path.charCodeAt(i);
    else if (isPathSeparator(code)) break;
    else code = 47;
    if (isPathSeparator(code)) {
      if (lastSlash === i - 1 || dots === 1) {
      } else if (lastSlash !== i - 1 && dots === 2) {
        if (
          res.length < 2 ||
          lastSegmentLength !== 2 ||
          res.charCodeAt(res.length - 1) !== 46 ||
          res.charCodeAt(res.length - 2) !== 46
        ) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf(separator);
            if (lastSlashIndex === -1) {
              res = "";
              lastSegmentLength = 0;
            } else {
              res = res.slice(0, lastSlashIndex);
              lastSegmentLength = res.length - 1 - res.lastIndexOf(separator);
            }
            lastSlash = i;
            dots = 0;
            continue;
          } else if (res.length === 2 || res.length === 1) {
            res = "";
            lastSegmentLength = 0;
            lastSlash = i;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0) res += `${separator}..`;
          else res = "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) res += separator + path.slice(lastSlash + 1, i);
        else res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code === 46 && dots !== -1) ++dots;
    else dots = -1;
  }
  return res;
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/posix/normalize.ts
/**
 * Normalize the `path`, resolving `'..'` and `'.'` segments.
 * Note that resolving these segments does not necessarily mean that all will be eliminated.
 * A `'..'` at the top-level will be preserved, and an empty path is canonically `'.'`.
 *
 * @example Usage
 * ```ts
 * import { normalize } from "@std/path/posix/normalize";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(normalize("/foo/bar//baz/asdf/quux/.."), "/foo/bar/baz/asdf");
 * assertEquals(normalize(new URL("file:///foo/bar//baz/asdf/quux/..")), "/foo/bar/baz/asdf/");
 * ```
 *
 * @example Working with URLs
 *
 * Note: This function will remove the double slashes from a URL's scheme.
 * Hence, do not pass a full URL to this function. Instead, pass the pathname of
 * the URL.
 *
 * ```ts
 * import { normalize } from "@std/path/posix/normalize";
 * import { assertEquals } from "@std/assert";
 *
 * const url = new URL("https://deno.land");
 * url.pathname = normalize("//std//assert//.//mod.ts");
 * assertEquals(url.href, "https://deno.land/std/assert/mod.ts");
 *
 * url.pathname = normalize("std/assert/../async/retry.ts");
 * assertEquals(url.href, "https://deno.land/std/async/retry.ts");
 * ```
 *
 * @param path The path to normalize.
 * @returns The normalized path.
 */
function normalize$2(path) {
  if (path instanceof URL) path = fromFileUrl$2(path);
  assertArg(path);
  const isAbsolute = isPosixPathSeparator$1(path.charCodeAt(0));
  const trailingSeparator = isPosixPathSeparator$1(path.charCodeAt(path.length - 1));
  path = normalizeString(path, !isAbsolute, "/", isPosixPathSeparator$1);
  if (path.length === 0 && !isAbsolute) path = ".";
  if (path.length > 0 && trailingSeparator) path += "/";
  if (isAbsolute) return `/${path}`;
  return path;
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/posix/join.ts
/**
 * Join all given a sequence of `paths`,then normalizes the resulting path.
 *
 * @example Usage
 * ```ts
 * import { join } from "@std/path/posix/join";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(join("/foo", "bar", "baz/asdf", "quux", ".."), "/foo/bar/baz/asdf");
 * assertEquals(join(new URL("file:///foo"), "bar", "baz/asdf", "quux", ".."), "/foo/bar/baz/asdf");
 * ```
 *
 * @example Working with URLs
 * ```ts
 * import { join } from "@std/path/posix/join";
 * import { assertEquals } from "@std/assert";
 *
 * const url = new URL("https://deno.land");
 * url.pathname = join("std", "path", "mod.ts");
 * assertEquals(url.href, "https://deno.land/std/path/mod.ts");
 *
 * url.pathname = join("//std", "path/", "/mod.ts");
 * assertEquals(url.href, "https://deno.land/std/path/mod.ts");
 * ```
 *
 * @param path The path to join. This can be string or file URL.
 * @param paths The paths to join.
 * @returns The joined path.
 */
function join$2(path, ...paths) {
  if (path === void 0) return ".";
  if (path instanceof URL) path = fromFileUrl$2(path);
  paths = path ? [path, ...paths] : paths;
  paths.forEach((path) => assertPath(path));
  const joined = paths.filter((path) => path.length > 0).join("/");
  return joined === "" ? "." : normalize$2(joined);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/windows/normalize.ts
/**
 * Normalize the `path`, resolving `'..'` and `'.'` segments.
 * Note that resolving these segments does not necessarily mean that all will be eliminated.
 * A `'..'` at the top-level will be preserved, and an empty path is canonically `'.'`.
 *
 * @example Usage
 * ```ts
 * import { normalize } from "@std/path/windows/normalize";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(normalize("C:\\foo\\..\\bar"), "C:\\bar");
 * assertEquals(normalize(new URL("file:///C:/foo/../bar")), "C:\\bar");
 * ```
 *
 * @param path The path to normalize
 * @returns The normalized path
 */
function normalize$1(path) {
  if (path instanceof URL) path = fromFileUrl$1(path);
  assertArg(path);
  const len = path.length;
  let rootEnd = 0;
  let device;
  let isAbsolute = false;
  const code = path.charCodeAt(0);
  if (len > 1) {
    if (isPathSeparator(code)) {
      isAbsolute = true;
      if (isPathSeparator(path.charCodeAt(1))) {
        let j = 2;
        let last = j;
        for (; j < len; ++j) if (isPathSeparator(path.charCodeAt(j))) break;
        if (j < len && j !== last) {
          const firstPart = path.slice(last, j);
          last = j;
          for (; j < len; ++j) if (!isPathSeparator(path.charCodeAt(j))) break;
          if (j < len && j !== last) {
            last = j;
            for (; j < len; ++j) if (isPathSeparator(path.charCodeAt(j))) break;
            if (j === len) return `\\\\${firstPart}\\${path.slice(last)}\\`;
            else if (j !== last) {
              device = `\\\\${firstPart}\\${path.slice(last, j)}`;
              rootEnd = j;
            }
          }
        }
      } else rootEnd = 1;
    } else if (isWindowsDeviceRoot(code)) {
      if (path.charCodeAt(1) === 58) {
        device = path.slice(0, 2);
        rootEnd = 2;
        if (len > 2) {
          if (isPathSeparator(path.charCodeAt(2))) {
            isAbsolute = true;
            rootEnd = 3;
          }
        }
      }
    }
  } else if (isPathSeparator(code)) return "\\";
  let tail;
  if (rootEnd < len)
    tail = normalizeString(path.slice(rootEnd), !isAbsolute, "\\", isPathSeparator);
  else tail = "";
  if (tail.length === 0 && !isAbsolute) tail = ".";
  if (tail.length > 0 && isPathSeparator(path.charCodeAt(len - 1))) tail += "\\";
  if (device === void 0) {
    if (isAbsolute) {
      if (tail.length > 0) return `\\${tail}`;
      else return "\\";
    }
    return tail;
  } else if (isAbsolute) {
    if (tail.length > 0) return `${device}\\${tail}`;
    else return `${device}\\`;
  }
  return device + tail;
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/windows/join.ts
/**
 * Join all given a sequence of `paths`,then normalizes the resulting path.
 *
 * @example Usage
 * ```ts
 * import { join } from "@std/path/windows/join";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(join("C:\\foo", "bar", "baz\\.."), "C:\\foo\\bar");
 * assertEquals(join(new URL("file:///C:/foo"), "bar", "baz\\.."), "C:\\foo\\bar");
 * ```
 *
 * @param path The path to join. This can be string or file URL.
 * @param paths The paths to join.
 * @returns The joined path.
 */
function join$1(path, ...paths) {
  if (path instanceof URL) path = fromFileUrl$1(path);
  paths = path ? [path, ...paths] : paths;
  paths.forEach((path) => assertPath(path));
  paths = paths.filter((path) => path.length > 0);
  if (paths.length === 0) return ".";
  let needsReplace = true;
  let slashCount = 0;
  const firstPart = paths[0];
  if (isPathSeparator(firstPart.charCodeAt(0))) {
    ++slashCount;
    const firstLen = firstPart.length;
    if (firstLen > 1) {
      if (isPathSeparator(firstPart.charCodeAt(1))) {
        ++slashCount;
        if (firstLen > 2) {
          if (isPathSeparator(firstPart.charCodeAt(2))) ++slashCount;
          else needsReplace = false;
        }
      }
    }
  }
  let joined = paths.join("\\");
  if (needsReplace) {
    for (; slashCount < joined.length; ++slashCount)
      if (!isPathSeparator(joined.charCodeAt(slashCount))) break;
    if (slashCount >= 2) joined = `\\${joined.slice(slashCount)}`;
  }
  return normalize$1(joined);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/join.ts
/**
 * Joins a sequence of paths, then normalizes the resulting path.
 *
 * @example Usage
 * ```ts
 * import { join } from "@std/path/join";
 * import { assertEquals } from "@std/assert";
 *
 * if (Deno.build.os === "windows") {
 *   assertEquals(join("C:\\foo", "bar", "baz\\quux", "garply", ".."), "C:\\foo\\bar\\baz\\quux");
 *   assertEquals(join(new URL("file:///C:/foo"), "bar", "baz/asdf", "quux", ".."), "C:\\foo\\bar\\baz\\asdf");
 * } else {
 *   assertEquals(join("/foo", "bar", "baz/quux", "garply", ".."), "/foo/bar/baz/quux");
 *   assertEquals(join(new URL("file:///foo"), "bar", "baz/asdf", "quux", ".."), "/foo/bar/baz/asdf");
 * }
 * ```
 *
 * @param path The path to join. This can be string or file URL.
 * @param paths Paths to be joined and normalized.
 * @returns The joined and normalized path.
 */
function join(path, ...paths) {
  return isWindows ? join$1(path, ...paths) : join$2(path, ...paths);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/normalize.ts
/**
 * Normalize the path, resolving `'..'` and `'.'` segments.
 *
 * Note: Resolving these segments does not necessarily mean that all will be
 * eliminated. A `'..'` at the top-level will be preserved, and an empty path is
 * canonically `'.'`.
 *
 * @example Usage
 * ```ts
 * import { normalize } from "@std/path/normalize";
 * import { assertEquals } from "@std/assert";
 *
 * if (Deno.build.os === "windows") {
 *   assertEquals(normalize("C:\\foo\\bar\\..\\baz\\quux"), "C:\\foo\\baz\\quux");
 *   assertEquals(normalize(new URL("file:///C:/foo/bar/../baz/quux")), "C:\\foo\\baz\\quux");
 * } else {
 *   assertEquals(normalize("/foo/bar/../baz/quux"), "/foo/baz/quux");
 *   assertEquals(normalize(new URL("file:///foo/bar/../baz/quux")), "/foo/baz/quux");
 * }
 * ```
 *
 * @param path Path to be normalized
 * @returns The normalized path.
 */
function normalize(path) {
  return isWindows ? normalize$1(path) : normalize$2(path);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/_common/env.ts
function cwd(errorMessage) {
  const global = globalThis;
  const getCwd = global.process?.cwd ?? global.Deno?.cwd;
  if (typeof getCwd !== "function") throw new TypeError(errorMessage);
  return getCwd();
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/posix/resolve.ts
/**
 * Resolves path segments into a `path`.
 *
 * @example Usage
 * ```ts
 * import { resolve } from "@std/path/posix/resolve";
 * import { assertEquals } from "@std/assert";
 *
 * const path = resolve("/foo", "bar", "baz/asdf", "quux", "..");
 * assertEquals(path, "/foo/bar/baz/asdf");
 * ```
 *
 * @param pathSegments The path segments to resolve.
 * @returns The resolved path.
 */
function resolve$2(...pathSegments) {
  let resolvedPath = "";
  let resolvedAbsolute = false;
  for (let i = pathSegments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    let path;
    if (i >= 0) path = pathSegments[i];
    else path = cwd("Resolved a relative path without a current working directory (CWD)");
    assertPath(path);
    if (path.length === 0) continue;
    resolvedPath = `${path}/${resolvedPath}`;
    resolvedAbsolute = isPosixPathSeparator$1(path.charCodeAt(0));
  }
  resolvedPath = normalizeString(resolvedPath, !resolvedAbsolute, "/", isPosixPathSeparator$1);
  if (resolvedAbsolute) {
    if (resolvedPath.length > 0) return `/${resolvedPath}`;
    else return "/";
  } else if (resolvedPath.length > 0) return resolvedPath;
  else return ".";
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/windows/resolve.ts
/**
 * Resolves path segments into a `path`.
 *
 * @example Usage
 * ```ts
 * import { resolve } from "@std/path/windows/resolve";
 * import { assertEquals } from "@std/assert";
 *
 * const resolved = resolve("C:\\foo\\bar", "..\\baz");
 * assertEquals(resolved, "C:\\foo\\baz");
 * ```
 *
 * @param pathSegments The path segments to process to path
 * @returns The resolved path
 */
function resolve$1(...pathSegments) {
  let resolvedDevice = "";
  let resolvedTail = "";
  let resolvedAbsolute = false;
  for (let i = pathSegments.length - 1; i >= -1; i--) {
    let path;
    if (i >= 0) path = pathSegments[i];
    else if (!resolvedDevice)
      path = cwd("Resolved a drive-letter-less path without a current working directory (CWD)");
    else {
      path = cwd("Resolved a relative path without a current working directory (CWD)");
      if (path === void 0 || path.slice(0, 3).toLowerCase() !== `${resolvedDevice.toLowerCase()}\\`)
        path = `${resolvedDevice}\\`;
    }
    assertPath(path);
    const len = path.length;
    if (len === 0) continue;
    let rootEnd = 0;
    let device = "";
    let isAbsolute = false;
    const code = path.charCodeAt(0);
    if (len > 1) {
      if (isPathSeparator(code)) {
        isAbsolute = true;
        if (isPathSeparator(path.charCodeAt(1))) {
          let j = 2;
          let last = j;
          for (; j < len; ++j) if (isPathSeparator(path.charCodeAt(j))) break;
          if (j < len && j !== last) {
            const firstPart = path.slice(last, j);
            last = j;
            for (; j < len; ++j) if (!isPathSeparator(path.charCodeAt(j))) break;
            if (j < len && j !== last) {
              last = j;
              for (; j < len; ++j) if (isPathSeparator(path.charCodeAt(j))) break;
              if (j === len) {
                device = `\\\\${firstPart}\\${path.slice(last)}`;
                rootEnd = j;
              } else if (j !== last) {
                device = `\\\\${firstPart}\\${path.slice(last, j)}`;
                rootEnd = j;
              }
            }
          }
        } else rootEnd = 1;
      } else if (isWindowsDeviceRoot(code)) {
        if (path.charCodeAt(1) === 58) {
          device = path.slice(0, 2);
          rootEnd = 2;
          if (len > 2) {
            if (isPathSeparator(path.charCodeAt(2))) {
              isAbsolute = true;
              rootEnd = 3;
            }
          }
        }
      }
    } else if (isPathSeparator(code)) {
      rootEnd = 1;
      isAbsolute = true;
    }
    if (
      device.length > 0 &&
      resolvedDevice.length > 0 &&
      device.toLowerCase() !== resolvedDevice.toLowerCase()
    )
      continue;
    if (resolvedDevice.length === 0 && device.length > 0) resolvedDevice = device;
    if (!resolvedAbsolute) {
      resolvedTail = `${path.slice(rootEnd)}\\${resolvedTail}`;
      resolvedAbsolute = isAbsolute;
    }
    if (resolvedAbsolute && resolvedDevice.length > 0) break;
  }
  resolvedTail = normalizeString(resolvedTail, !resolvedAbsolute, "\\", isPathSeparator);
  return resolvedDevice + (resolvedAbsolute ? "\\" : "") + resolvedTail || ".";
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/resolve.ts
/**
 * Resolves path segments into a path.
 *
 * @example Usage
 * ```ts
 * import { resolve } from "@std/path/resolve";
 * import { assertEquals } from "@std/assert";
 *
 * if (Deno.build.os === "windows") {
 *   assertEquals(resolve("C:\\foo", "bar", "baz"), "C:\\foo\\bar\\baz");
 *   assertEquals(resolve("C:\\foo", "C:\\bar", "baz"), "C:\\bar\\baz");
 * } else {
 *   assertEquals(resolve("/foo", "bar", "baz"), "/foo/bar/baz");
 *   assertEquals(resolve("/foo", "/bar", "baz"), "/bar/baz");
 * }
 * ```
 *
 * @param pathSegments Path segments to process to path.
 * @returns The resolved path.
 */
function resolve(...pathSegments) {
  return isWindows ? resolve$1(...pathSegments) : resolve$2(...pathSegments);
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/_common/to_file_url.ts
const WHITESPACE_ENCODINGS = {
  "	": "%09",
  "\n": "%0A",
  "\v": "%0B",
  "\f": "%0C",
  "\r": "%0D",
  " ": "%20",
};
function encodeWhitespace(string) {
  return string.replaceAll(/[\s]/g, (c) => {
    return WHITESPACE_ENCODINGS[c] ?? c;
  });
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/posix/to_file_url.ts
/**
 * Converts a path string to a file URL.
 *
 * @example Usage
 * ```ts
 * import { toFileUrl } from "@std/path/posix/to-file-url";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(toFileUrl("/home/foo"), new URL("file:///home/foo"));
 * assertEquals(toFileUrl("/home/foo bar"), new URL("file:///home/foo%20bar"));
 * assertEquals(toFileUrl("//foo/bar"), new URL("file:///foo/bar"));
 * ```
 *
 * @param path The path to convert.
 * @returns The file URL.
 */
function toFileUrl$2(path) {
  if (!isAbsolute$2(path)) throw new TypeError(`Path must be absolute: received "${path}"`);
  const url = new URL("file:///");
  url.pathname = encodeWhitespace(
    path.replace(/^\/+/, "/").replace(/%/g, "%25").replace(/\\/g, "%5C"),
  );
  return url;
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/windows/to_file_url.ts
/**
 * Converts a path string to a file URL.
 *
 * @example Usage
 * ```ts
 * import { toFileUrl } from "@std/path/windows/to-file-url";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(toFileUrl("\\home\\foo"), new URL("file:///home/foo"));
 * assertEquals(toFileUrl("C:\\Users\\foo"), new URL("file:///C:/Users/foo"));
 * assertEquals(toFileUrl("\\\\127.0.0.1\\home\\foo"), new URL("file://127.0.0.1/home/foo"));
 * ```
 * @param path The path to convert.
 * @returns The file URL.
 */
function toFileUrl$1(path) {
  if (!isAbsolute$1(path)) throw new TypeError(`Path must be absolute: received "${path}"`);
  const [, hostname, pathname] = path.match(/^(?:[/\\]{2}([^/\\]+)(?=[/\\](?:[^/\\]|$)))?(.*)/);
  const url = new URL("file:///");
  url.pathname = encodeWhitespace(pathname.replace(/%/g, "%25"));
  if (hostname !== void 0 && hostname !== "localhost") {
    url.hostname = hostname;
    if (!url.hostname) throw new TypeError(`Invalid hostname: "${url.hostname}"`);
  }
  return url;
}
//#endregion
//#region vendor/js/jsr.io/@std/path/1.1.6/to_file_url.ts
/**
 * Converts a path string to a file URL.
 *
 * @example Usage
 * ```ts
 * import { toFileUrl } from "@std/path/to-file-url";
 * import { assertEquals } from "@std/assert";
 *
 * if (Deno.build.os === "windows") {
 *   assertEquals(toFileUrl("\\home\\foo"), new URL("file:///home/foo"));
 *   assertEquals(toFileUrl("C:\\Users\\foo"), new URL("file:///C:/Users/foo"));
 *   assertEquals(toFileUrl("\\\\127.0.0.1\\home\\foo"), new URL("file://127.0.0.1/home/foo"));
 * } else {
 *   assertEquals(toFileUrl("/home/foo"), new URL("file:///home/foo"));
 * }
 * ```
 *
 * @param path Path to convert to file URL.
 * @returns The file URL equivalent to the path.
 */
function toFileUrl(path) {
  return isWindows ? toFileUrl$1(path) : toFileUrl$2(path);
}
//#endregion
//#region vendor/js/jsr.io/@std/fs/1.0.24/_get_file_info_type.ts
/**
 * Get a human readable file type string.
 *
 * @param file File information, as returned by {@linkcode Deno.stat} or
 * {@linkcode Deno.lstat}.
 *
 * @returns The file type as a string, or `undefined` if the file type is
 * unknown.
 */
function getFileInfoType(fileInfo) {
  return fileInfo.isFile
    ? "file"
    : fileInfo.isDirectory
      ? "dir"
      : fileInfo.isSymlink
        ? "symlink"
        : void 0;
}
//#endregion
//#region vendor/js/jsr.io/@std/fs/1.0.24/ensure_dir.ts
/**
 * Asynchronously ensures that the directory exists, like
 * {@linkcode https://www.ibm.com/docs/en/aix/7.3?topic=m-mkdir-command#mkdir__row-d3e133766 | mkdir -p}.
 *
 * If the directory already exists, this function does nothing. If the directory
 * does not exist, it is created.
 *
 * Requires `--allow-read` and `--allow-write` permissions.
 *
 * @see {@link https://docs.deno.com/runtime/manual/basics/permissions#file-system-access}
 * for more information on Deno's permissions system.
 *
 * @param dir The path of the directory to ensure, as a string or URL.
 *
 * @returns A promise that resolves once the directory exists.
 *
 * @example Usage
 * ```ts ignore
 * import { ensureDir } from "@std/fs/ensure-dir";
 *
 * await ensureDir("./bar");
 * ```
 */
async function ensureDir(dir) {
  try {
    throwIfNotDirectory(await Deno.stat(dir));
    return;
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
  }
  try {
    await Deno.mkdir(dir, { recursive: true });
  } catch (err) {
    if (!(err instanceof Deno.errors.AlreadyExists)) throw err;
    throwIfNotDirectory(await Deno.stat(dir));
  }
}
function throwIfNotDirectory(fileInfo) {
  if (!fileInfo.isDirectory)
    throw new Error(
      `Failed to ensure directory exists: expected 'dir', got '${getFileInfoType(fileInfo)}'`,
    );
}
//#endregion
//#region vendor/js/jsr.io/@std/fmt/1.0.10/colors.ts
/**
 * String formatters and utilities for dealing with ANSI color codes.
 *
 * > [!IMPORTANT]
 * > If printing directly to the console, it's recommended to style console
 * > output using CSS (guide
 * > {@linkcode https://developer.mozilla.org/en-US/docs/Web/API/console#styling_console_output | here}).
 *
 * This module supports `NO_COLOR` environmental variable disabling any coloring
 * if `NO_COLOR` is set.
 *
 * ```ts no-assert
 * import {
 *   bgBlue,
 *   bgRgb24,
 *   bgRgb8,
 *   bold,
 *   italic,
 *   red,
 *   rgb24,
 *   rgb8,
 * } from "@std/fmt/colors";
 *
 * console.log(bgBlue(italic(red(bold("Hello, World!")))));
 *
 * // also supports 8bit colors
 *
 * console.log(rgb8("Hello, World!", 42));
 *
 * console.log(bgRgb8("Hello, World!", 42));
 *
 * // and 24bit rgb
 *
 * console.log(rgb24("Hello, World!", {
 *   r: 41,
 *   g: 42,
 *   b: 43,
 * }));
 *
 * console.log(bgRgb24("Hello, World!", {
 *   r: 41,
 *   g: 42,
 *   b: 43,
 * }));
 * ```
 *
 * @module
 */
const { Deno: Deno$1 } = globalThis;
let enabled = !(typeof Deno$1?.noColor === "boolean" ? Deno$1.noColor : false);
/**
 * Builds color code
 * @param open
 * @param close
 */
function code(open, close) {
  return {
    open: `\x1b[${open.join(";")}m`,
    close: `\x1b[${close}m`,
    regexp: new RegExp(`\\x1b\\[${close}m`, "g"),
  };
}
/**
 * Applies color and background based on color code and its associated text
 * @param str The text to apply color settings to
 * @param code The color code to apply
 */
function run(str, code) {
  return enabled ? `${code.open}${str.replace(code.regexp, code.open)}${code.close}` : str;
}
/**
 * Set text color to green.
 *
 * @example Usage
 * ```ts no-assert
 * import { green } from "@std/fmt/colors";
 *
 * console.log(green("Hello, world!"));
 * ```
 *
 * @param str The text to make green
 * @returns The green text
 */
function green(str) {
  return run(str, code([32], 39));
}
new RegExp(
  [
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TXZcf-nq-uy=><~]))",
  ].join("|"),
  "g",
);
//#endregion
//#region vendor/js/jsr.io/@std/encoding/1.0.11/_common16.ts
const alphabet$1 = new TextEncoder().encode("0123456789abcdef");
const rAlphabet$1 = /* @__PURE__ */ new Uint8Array(128).fill(16);
alphabet$1.forEach((byte, i) => (rAlphabet$1[byte] = i));
new TextEncoder().encode("ABCDEF").forEach((byte, i) => (rAlphabet$1[byte] = i + 10));
/**
 * Calculate the output size needed to encode a given input size for
 * {@linkcode encodeIntoHex}.
 *
 * @param originalSize The size of the input buffer.
 * @returns The size of the output buffer.
 *
 * @example Basic Usage
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { calcSizeHex } from "@std/encoding/unstable-hex";
 *
 * assertEquals(calcSizeHex(1), 2);
 * ```
 */
function calcSizeHex(originalSize) {
  return originalSize * 2;
}
function encode(buffer, i, o, alphabet) {
  for (; i < buffer.length; ++i) {
    const x = buffer[i];
    buffer[o++] = alphabet[x >> 4];
    buffer[o++] = alphabet[x & 15];
  }
  return o;
}
//#endregion
//#region vendor/js/jsr.io/@std/encoding/1.0.11/_common_detach.ts
function detach(buffer, maxSize) {
  const originalSize = buffer.length;
  if (buffer.byteOffset) {
    const b = new Uint8Array(buffer.buffer);
    b.set(buffer);
    buffer = b.subarray(0, originalSize);
  }
  buffer = new Uint8Array(buffer.buffer.transfer(maxSize));
  buffer.set(buffer.subarray(0, originalSize), maxSize - originalSize);
  return [buffer, maxSize - originalSize];
}
//#endregion
//#region vendor/js/jsr.io/@std/encoding/1.0.11/hex.ts
/**
 * Port of the Go
 * {@link https://github.com/golang/go/blob/go1.12.5/src/encoding/hex/hex.go | encoding/hex}
 * library.
 *
 * ```ts
 * import {
 *   decodeHex,
 *   encodeHex,
 * } from "@std/encoding/hex";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(encodeHex("abc"), "616263");
 *
 * assertEquals(
 *   decodeHex("616263"),
 *   new TextEncoder().encode("abc"),
 * );
 * ```
 *
 * @module
 */
const alphabet = new TextEncoder().encode("0123456789abcdef");
const rAlphabet = /* @__PURE__ */ new Uint8Array(128).fill(16);
alphabet.forEach((byte, i) => (rAlphabet[byte] = i));
new TextEncoder().encode("ABCDEF").forEach((byte, i) => (rAlphabet[byte] = i + 10));
/**
 * Converts data into a hex-encoded string.
 *
 * @param src The data to encode.
 *
 * @returns The hex-encoded string.
 *
 * @example Usage
 * ```ts
 * import { encodeHex } from "@std/encoding/hex";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(encodeHex("abc"), "616263");
 * ```
 */
function encodeHex(src) {
  if (typeof src === "string") src = new TextEncoder().encode(src);
  else if (src instanceof ArrayBuffer) src = new Uint8Array(src).slice();
  else src = src.slice();
  const [output, i] = detach(src, calcSizeHex(src.length));
  encode(output, i, 0, alphabet);
  return new TextDecoder().decode(output);
}
//#endregion
//#region vendor/js/jsr.io/@denosaurs/plug/1.1.0/util.ts
/**
 * This file contains useful utility functions used by plug.
 *
 * @module
 */
const encoder = new TextEncoder();
function baseUrlToFilename(url) {
  const out = [];
  const protocol = url.protocol.replace(":", "");
  out.push(protocol);
  switch (protocol) {
    case "http":
    case "https": {
      const host = url.hostname;
      const hostPort = url.port;
      out.push(hostPort ? `${host}_PORT${hostPort}` : host);
      break;
    }
    case "file":
    case "data":
    case "blob":
      break;
    default:
      throw new TypeError(`Don't know how to create cache name for protocol: ${protocol}`);
  }
  return join(...out);
}
/**
 * Transforms a string into a URL.
 *
 * @private
 */
function stringToURL(url) {
  return url.startsWith("file://") || url.startsWith("http://") || url.startsWith("https://")
    ? new URL(url)
    : toFileUrl(resolve(url));
}
/**
 * SHA-256 hashes a string. Used internally to hash URLs for cache filenames.
 *
 * @private
 */
async function hash(value) {
  return encodeHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
/**
 * Transforms a URL into a filename for the cache.
 *
 * @private
 */
async function urlToFilename(url) {
  return join(baseUrlToFilename(url), await hash(url.pathname + url.search));
}
/**
 * Checks if a file exists.
 *
 * @private
 */
async function isFile(filePath) {
  try {
    return (await Deno.lstat(filePath)).isFile;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return false;
    throw err;
  }
}
/**
 * @returns The home directory of the user.
 */
function homeDir() {
  switch (Deno.build.os) {
    case "windows":
      return Deno.env.get("USERPROFILE");
    case "linux":
    case "darwin":
    case "freebsd":
    case "netbsd":
    case "aix":
    case "solaris":
    case "illumos":
    case "android":
      return Deno.env.get("HOME");
    default:
      throw Error("unreachable");
  }
}
/**
 * @returns The cache directory of the user.
 */
function cacheDir() {
  if (Deno.build.os === "darwin") {
    const home = homeDir();
    if (home) return join(home, "Library/Caches");
  } else if (Deno.build.os === "windows") return Deno.env.get("LOCALAPPDATA");
  else {
    const cacheHome = Deno.env.get("XDG_CACHE_HOME");
    if (cacheHome) return cacheHome;
    else {
      const home = homeDir();
      if (home) return join(home, ".cache");
    }
  }
}
/**
 * @returns The cache directory for Deno.
 */
function denoCacheDir() {
  const dd = Deno.env.get("DENO_DIR");
  let root;
  if (dd) root = normalize(isAbsolute(dd) ? dd : join(Deno.cwd(), dd));
  else {
    const cd = cacheDir();
    if (cd) root = join(cd, "deno");
    else {
      const hd = homeDir();
      if (hd) root = join(hd, ".deno");
    }
  }
  return root;
}
//#endregion
//#region vendor/js/jsr.io/@denosaurs/plug/1.1.0/download.ts
/**
 * This module contains the common types used in plug.
 *
 * @module
 */
/**
 * A list of all possible system architectures.
 *
 * This should match the {@link Deno.build.arch} type.
 */
const ALL_ARCHS = ["x86_64", "aarch64"];
/**
 * A list of all possible system operating systems.
 *
 * This should match the {@link Deno.build.os} type.
 */
const ALL_OSS = [
  "darwin",
  "linux",
  "android",
  "windows",
  "freebsd",
  "netbsd",
  "aix",
  "solaris",
  "illumos",
];
/**
 * The default file extensions for dynamic libraries in the different operating
 * systems.
 */
const defaultExtensions = {
  darwin: "dylib",
  linux: "so",
  windows: "dll",
  freebsd: "so",
  netbsd: "so",
  aix: "so",
  solaris: "so",
  illumos: "so",
  android: "so",
};
/**
 * The default file prefixes for dynamic libraries in the different operating
 * systems.
 */
const defaultPrefixes = {
  darwin: "lib",
  linux: "lib",
  netbsd: "lib",
  freebsd: "lib",
  aix: "lib",
  solaris: "lib",
  illumos: "lib",
  windows: "",
  android: "lib",
};
function getCrossOption(record) {
  if (record === void 0) return;
  if (ALL_OSS.some((os) => os in record)) {
    const subrecord = record[Deno.build.os];
    if (subrecord && typeof subrecord === "object" && ALL_ARCHS.some((arch) => arch in subrecord))
      return subrecord[Deno.build.arch];
    else return subrecord;
  }
  if (ALL_ARCHS.some((arch) => arch in record)) {
    const subrecord = record[Deno.build.arch];
    if (subrecord && typeof subrecord === "object" && ALL_OSS.some((os) => os in subrecord))
      return subrecord[Deno.build.os];
    else return subrecord;
  }
}
/**
 * Creates a cross-platform url for the specified options
 *
 * @param options See {@link FetchOptions}
 * @returns A fully specified url to the specified file
 */
function createDownloadURL(options) {
  if (typeof options === "string" || options instanceof URL) options = { url: options };
  options.extensions ??= defaultExtensions;
  options.prefixes ??= defaultPrefixes;
  for (const key in options.extensions) {
    const os = key;
    if (options.extensions[os] !== void 0)
      options.extensions[os] = options.extensions[os].replace(/\.?(.+)/, "$1");
  }
  let url;
  if (options.url instanceof URL) url = options.url;
  else if (typeof options.url === "string") url = stringToURL(options.url);
  else {
    const tmpUrl = getCrossOption(options.url);
    if (tmpUrl === void 0)
      throw new TypeError(
        `An URL for the "${Deno.build.os}-${Deno.build.arch}" target was not provided.`,
      );
    if (typeof tmpUrl === "string") url = stringToURL(tmpUrl);
    else url = tmpUrl;
  }
  if ("name" in options && !Object.values(options.extensions).includes(extname(url.pathname))) {
    if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
    const prefix = getCrossOption(options.prefixes) ?? "";
    const suffix = getCrossOption(options.suffixes) ?? "";
    const extension = options.extensions[Deno.build.os];
    if (options.name === void 0)
      throw new TypeError(`Expected the "name" property for an automatically assembled URL.`);
    const filename = `${prefix}${options.name}${suffix}.${extension}`;
    url = new URL(filename, url);
  }
  return url;
}
/**
 * Return the path to the cache location along with ensuring its existance
 *
 * @param location See the {@link CacheLocation} type
 * @returns The cache location path
 */
async function ensureCacheLocation(location = "deno") {
  if (location === "deno") {
    const dir = denoCacheDir();
    if (dir === void 0)
      throw new Error(
        "Could not get the deno cache directory, try using another CacheLocation in the plug options.",
      );
    location = join(dir, "plug");
  } else if (location === "cache") {
    const dir = cacheDir();
    if (dir === void 0)
      throw new Error(
        "Could not get the cache directory, try using another CacheLocation in the plug options.",
      );
    location = join(dir, "plug");
  } else if (location === "cwd") location = join(Deno.cwd(), "plug");
  else if (location === "tmp") location = await Deno.makeTempDir({ prefix: "plug" });
  else if (typeof location === "string" && location.startsWith("file://"))
    location = fromFileUrl(location);
  else if (location instanceof URL) {
    if (location?.protocol !== "file:")
      throw new TypeError("Cannot use any other protocol than file:// for an URL cache location.");
    location = fromFileUrl(location);
  }
  location = resolve(normalize(location));
  await ensureDir(location);
  return location;
}
/**
 * Downloads a file using the specified {@link FetchOptions}
 *
 * @param options See {@link FetchOptions}
 * @returns The path to the downloaded file in its cached location
 */
async function download(options) {
  const location =
    (typeof options === "object" && "location" in options ? options.location : void 0) ?? "deno";
  const setting =
    (typeof options === "object" && "cache" in options ? options.cache : void 0) ?? "use";
  const url = createDownloadURL(options);
  const cacheBasePath = join(await ensureCacheLocation(location), await urlToFilename(url));
  const cacheFilePath = `${cacheBasePath}${extname(url.pathname)}`;
  const cacheMetaPath = `${cacheBasePath}.metadata.json`;
  const cached =
    setting === "use" ? await isFile(cacheFilePath) : setting === "only" || setting !== "reloadAll";
  await ensureDir(dirname(cacheBasePath));
  if (!cached) {
    const meta = { url };
    switch (url.protocol) {
      case "http:":
      case "https:": {
        console.log(`${green("Downloading")} ${url}`);
        const response = await fetch(url.toString());
        if (!response.ok) {
          if (response.status === 404) throw new Error(`Could not find ${url}`);
          else throw new Deno.errors.Http(`${response.status} ${response.statusText}`);
        }
        await Deno.writeFile(cacheFilePath, new Uint8Array(await response.arrayBuffer()));
        break;
      }
      case "file:":
        console.log(`${green("Copying")} ${url}`);
        await Deno.copyFile(fromFileUrl(url), cacheFilePath);
        if (Deno.build.os !== "windows") await Deno.chmod(cacheFilePath, 420);
        break;
      default:
        throw new TypeError(`Cannot fetch to cache using the "${url.protocol}" protocol`);
    }
    await Deno.writeTextFile(cacheMetaPath, JSON.stringify(meta));
  }
  if (!(await isFile(cacheFilePath))) throw new Error(`Could not find "${url}" in cache.`);
  return cacheFilePath;
}
//#endregion
//#region vendor/js/jsr.io/@denosaurs/plug/1.1.0/mod.ts
/**
 * Plug is a drop in extension for using remote dynamic libraries in deno. It
 * automatically handles caching and loading with minimal overhead. It can
 * automatically create the URL for your cross-operating-system, cross-architecture
 * libraries if you so wish using a simple configuration which deviates from
 * the standard URL/string path input.
 *
 * @example
 * ```ts
 * import { dlopen } from "@denosaurs/plug";
 *
 * // Drop-in replacement for `Deno.dlopen` which fetches the following depending
 * // on operating system:
 * // * darwin: "https://example.com/some/path/libexample.dylib"
 * // * windows: "https://example.com/some/path/example.dll"
 * // * linux: "https://example.com/some/path/libexample.so"
 * const library = await dlopen("https://example.com/some/path/", {
 *   noop: { parameters: [], result: "void" },
 * });
 *
 * library.symbols.noop();
 * ```
 *
 * @example
 * ```ts
 * import { dlopen, FetchOptions } from "@denosaurs/plug";
 *
 * // If you want plug to guess your binary names
 * const options: FetchOptions = {
 *   name: "example",
 *   url: "https://example.com/some/path/",
 *   // Becomes:
 *   // darwin: "https://example.com/some/path/libexample.dylib"
 *   // windows: "https://example.com/some/path/example.dll"
 *   // linux: "https://example.com/some/path/libexample.so"
 * };
 *
 * const library = await dlopen(options, {
 *   noop: { parameters: [], result: "void" },
 * });
 *
 * library.symbols.noop();
 * ```
 *
 * @example
 * ```ts
 * import { dlopen, FetchOptions } from "@denosaurs/plug";
 *
 * // Also you can specify the path for certain architecture
 * const options: FetchOptions = {
 *   name: "example",
 *   url: {
 *     darwin: {
 *       aarch64: `https://example.com/some/path/libexample.aarch64.dylib`,
 *       x86_64: `https://example.com/some/path/libexample.x86_64.dylib`,
 *     },
 *     windows: `https://example.com/some/path/example.dll`,
 *     linux: `https://example.com/some/path/libexample.so`,
 *   },
 * };
 *
 * await dlopen(options, {});
 * ```
 *
 * @example
 * ```ts
 * import { dlopen, FetchOptions } from "@denosaurs/plug";
 *
 * // Or even configure plug to automatically guess the binary names for you,
 * // even when there are special rules for naming on specific architectures
 * const options: FetchOptions = {
 *   name: "test",
 *   url: "https://example.com/some/path/",
 *   suffixes: {
 *     darwin: {
 *       aarch64: ".aarch64",
 *       x86_64: ".x86_64",
 *     },
 *   },
 *   // Becomes:
 *   // darwin-aarch64: "https://example.com/some/path/libexample.aarch64.dylib"
 *   // darwin-x86_64: "https://example.com/some/path/libexample.x86_64.dylib"
 * };
 *
 * await dlopen(options, {});
 * ```
 *
 * @module
 */
/**
 * Opens a dynamic library and registers symbols, compatible with
 * {@link Deno.dlopen} yet with extended functionality allowing you to use
 * remote (or local) binaries, automatically building the binary name and
 * controlling the caching policy.
 *
 * @example
 * ```ts
 * import { dlopen, FetchOptions } from "@denosaurs/plug";
 *
 * // Configure plug to automatically guess the binary names for you, even when
 * // there for example are special rules for naming on specific architectures
 * const options: FetchOptions = {
 *   name: "test",
 *   url: "https://example.com/some/path/",
 *   suffixes: {
 *     darwin: {
 *       aarch64: ".aarch64",
 *       x86_64: ".x86_64",
 *     },
 *   },
 *   // Becomes:
 *   // darwin-aarch64: "https://example.com/some/path/libexample.aarch64.dylib"
 *   // darwin-x86_64: "https://example.com/some/path/libexample.x86_64.dylib"
 * };
 *
 * await dlopen(options, {});
 * ```
 *
 * @param options See {@link FetchOptions}
 * @param symbols A record extending {@link Deno.ForeignLibraryInterface}
 * @returns An opened {@link Deno.DynamicLibrary}
 */
async function dlopen(options, symbols) {
  if (Deno.dlopen === void 0) throw new Error("`--unstable-ffi` is required");
  return Deno.dlopen(await download(options), symbols);
}
//#endregion
//#region vendor/js/jsr.io/@sigma/pty-ffi/0.42.0/deno.json
var version = "0.42.0";
//#endregion
//#region vendor/js/jsr.io/@sigma/pty-ffi/0.42.0/src/ffi.ts
const SYMBOLS = {
  pty_create: {
    parameters: ["pointer", "usize", "buffer"],
    result: "i8",
  },
  pty_read: {
    parameters: ["pointer", "buffer"],
    result: "i8",
  },
  pty_read_bytes: {
    parameters: ["pointer", "buffer"],
    result: "i8",
  },
  pty_write: {
    parameters: ["pointer", "buffer", "buffer"],
    result: "i8",
  },
  pty_get_size: {
    parameters: ["pointer", "buffer", "buffer", "buffer"],
    result: "i8",
  },
  pty_resize: {
    parameters: ["pointer", "pointer", "usize", "buffer"],
    result: "i8",
  },
  pty_close: {
    parameters: ["pointer"],
    result: "void",
  },
  free_string: {
    parameters: ["pointer"],
    result: "void",
  },
  free_data: {
    parameters: ["pointer", "usize"],
    result: "void",
  },
};
let LIBRARY = void 0;
/**
 * Gets the instantiated library instance.
 * @throws {Error} If the library has not been instantiated yet.
 * @returns {PtyLib} The instantiated library.
 */
function getLibrary() {
  if (!LIBRARY) throw new Error("Library not instantiated. Call instantiate() first.");
  return LIBRARY;
}
/**
 * Loads the native Pty library.
 * @param {string} [libPath] - Optional path to the library file otherwise it will fetch released builds from GitHub.
 * @throws {Error} If the library fails to load.
 */
async function instantiate(libPath) {
  if (libPath) {
    LIBRARY = Deno.dlopen(libPath, SYMBOLS);
    return;
  }
  const isLocalDev = !!Deno.env.get("RUST_LIB_PATH");
  LIBRARY = await dlopen(
    {
      name: "pty",
      url: isLocalDev
        ? Deno.env.get("RUST_LIB_PATH")
        : `https://github.com/sigmaSd/deno-pty-ffi/releases/download/${version}`,
      cache: isLocalDev ? "reloadAll" : "use",
      suffixes: isLocalDev
        ? {}
        : {
            linux: {
              aarch64: "_aarch64",
              x86_64: "_x86_64",
            },
            darwin: {
              aarch64: "_arm64",
              x86_64: "_x86_64",
            },
          },
    },
    SYMBOLS,
  );
}
/**
 * Utility function to get the library name depending on the OS.
 * @returns {string} The name of the library.
 */
function libName() {
  switch (Deno.build.os) {
    case "linux":
      return `libpty_${Deno.build.arch}.so`;
    case "darwin":
      return `libpty_${Deno.build.arch === "x86_64" ? "x86_64" : "arm64"}.dylib`;
    case "windows":
      return "pty.dll";
    default:
      throw new Error(`Unsupported OS: ${Deno.build.os}`);
  }
}
//#endregion
//#region vendor/js/jsr.io/@std/assert/1.0.19/assertion_error.ts
/**
 * Error thrown when an assertion fails.
 *
 * @example Usage
 * ```ts ignore
 * import { AssertionError } from "@std/assert";
 *
 * try {
 *   throw new AssertionError("foo", { cause: "bar" });
 * } catch (error) {
 *   if (error instanceof AssertionError) {
 *     error.message === "foo"; // true
 *     error.cause === "bar"; // true
 *   }
 * }
 * ```
 */
var AssertionError = class extends Error {
  /** Constructs a new instance.
   *
   * @param message The error message.
   * @param options Additional options. This argument is still unstable. It may change in the future release.
   */
  constructor(message, options) {
    super(message, options);
    this.name = "AssertionError";
  }
};
//#endregion
//#region vendor/js/jsr.io/@std/assert/1.0.19/assert.ts
/**
 * Make an assertion, an error will be thrown if `expr` does not have a truthy value.
 *
 * @example Usage
 * ```ts ignore
 * import { assert } from "@std/assert";
 *
 * assert("hello".includes("ello")); // Doesn't throw
 * assert("hello".includes("world")); // Throws
 * ```
 *
 * @param expr The expression to test.
 * @param msg The optional message to display if the assertion fails.
 * @throws {AssertionError} If `expr` is falsy.
 */
function assert(expr, msg = "") {
  if (!expr) throw new AssertionError(msg);
}
//#endregion
//#region vendor/js/jsr.io/@sigma/pty-ffi/0.42.0/src/utils.ts
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
/**
 * Encodes a JavaScript string into a Uint8Array representing a
 * null-terminated C string (UTF-8 bytes + trailing '\0').
 * Use this for functions like `pty_write` that expect a CString.
 */
function encodeCString(str) {
  const utf8Bytes = ENCODER.encode(str);
  const buffer = new Uint8Array(utf8Bytes.length + 1);
  buffer.set(utf8Bytes, 0);
  return buffer;
}
/**
 * Encodes arbitrary data (by JSON stringifying it) into a raw
 * UTF-8 byte buffer (Uint8Array). Does NOT add a null terminator.
 * Use this for functions expecting pointer + length (e.g., `pty_create`, `pty_resize`).
 */
function encodePointerLenData(data) {
  const jsonString = JSON.stringify(data);
  return ENCODER.encode(jsonString);
}
/**
 * Decodes a null-terminated C string (UTF-8) pointed to by `ptr`
 * into a JavaScript string.
 * Assumes `ptr` is valid and was allocated by Rust (e.g., error messages, read data).
 * IMPORTANT: The caller is responsible for freeing the `ptr` using `freeRustString` afterwards.
 */
function decodeCString(ptr) {
  assert(ptr !== null, "decodeCString received a null pointer");
  return new Deno.UnsafePointerView(ptr).getCString();
}
/**
 * Decodes a raw byte buffer (pointed to by `ptr` with `len`) containing
 * UTF-8 encoded JSON data into a JavaScript object.
 * Assumes `ptr` and `len` are valid and came from Rust (e.g., `pty_get_size`).
 * IMPORTANT: The caller is responsible for freeing the data using `freeRustData` afterwards.
 */
function decodePointerLenData(ptr, len) {
  assert(ptr !== null, "decodePointerLenData received a null pointer");
  assert(len >= 0, "decodePointerLenData received negative length");
  if (len === 0) {
    if (ptr === null) return JSON.parse("{}");
    throw new Error("decodePointerLenData received non-null pointer but zero length");
  }
  const bytes = new Deno.UnsafePointerView(ptr).getArrayBuffer(len);
  const jsonString = DECODER.decode(bytes);
  return JSON.parse(jsonString);
}
/**
 * Reads a pointer address (returned by Rust as e.g., usize)
 * from a result buffer (BigUint64Array of length 1) and
 * converts it into a Deno.PointerValue (or null if address is 0).
 */
function readPointerFromResultBuffer(resultBuffer) {
  assert(resultBuffer.length >= 1, "Result buffer must have length >= 1");
  return Deno.UnsafePointer.create(resultBuffer[0]);
}
/**
 * Reads an error message (as CString) from a result buffer after an FFI call failed.
 * Assumes the FFI function placed the CString pointer into the result buffer.
 * Automatically frees the Rust-allocated memory for the string.
 */
function readErrorAndFree(lib, resultBuffer) {
  const errorPtr = readPointerFromResultBuffer(resultBuffer);
  if (!errorPtr) return "FFI call failed: Unknown error (null pointer returned)";
  try {
    return decodeCString(errorPtr);
  } finally {
    freeRustString(lib, errorPtr);
  }
}
/**
 * Calls the Rust `free_string` function to deallocate memory
 * previously allocated by Rust for a CString.
 */
function freeRustString(lib, ptr) {
  if (ptr) lib.symbols.free_string(ptr);
}
/**
 * Calls the Rust `free_data` function to deallocate memory
 * previously allocated by Rust for raw byte data (pointer + length).
 */
function freeRustData(lib, ptr, len) {
  if (ptr && len > 0) lib.symbols.free_data(ptr, BigInt(len));
  else if (ptr && len === 0) {
  }
}
//#endregion
//#region vendor/js/jsr.io/@sigma/pty-ffi/0.42.0/src/mod.ts
/**
 * Represents a Pseudo-Terminal (PTY) managed via a Rust FFI backend.
 * Provides methods for interacting with the PTY, such as reading output,
 * writing input, resizing, and closing. Also offers stream-based APIs
 * for reading and writing.
 */
var Pty = class {
  /** @internal The opaque pointer to the underlying Rust Pty struct. Null if closed. */
  #ptr;
  /** @internal Configurable polling interval for readableStream */
  #pollingIntervalMs = 100;
  #exitCode;
  /** The exit code of the process, if it has exited. */
  get exitCode() {
    return this.#exitCode;
  }
  /**
   * Creates a new Pty instance and spawns the specified command within it.
   * This involves communicating with the Rust FFI layer to create the underlying
   * pseudoterminal and start the child process.
   *
   * @param command - The program path
   * @param options - The command configuration
   * @throws {Error} If the FFI call to create the PTY fails.
   * @throws {Error} If the FFI call succeeds but returns an invalid pointer.
   */
  constructor(command, options = {}) {
    const cmdData = encodePointerLenData({
      cmd: command,
      ...options,
      ...(options.size
        ? {
            size: {
              pixel_width: 0,
              pixel_height: 0,
              ...options.size,
            },
          }
        : {}),
    });
    const cmdDataPtr = Deno.UnsafePointer.of(cmdData);
    const resultPtrBuf = /* @__PURE__ */ new BigUint64Array(1);
    if (getLibrary().symbols.pty_create(cmdDataPtr, BigInt(cmdData.length), resultPtrBuf) === -1) {
      const errorMsg = readErrorAndFree(getLibrary(), resultPtrBuf);
      throw new Error(`Pty creation failed: ${errorMsg}`);
    }
    const ptyPtr = readPointerFromResultBuffer(resultPtrBuf);
    if (!ptyPtr) throw new Error("Pty creation succeeded but returned a null pointer.");
    this.#ptr = ptyPtr;
  }
  /**
   * Reads pending output from the PTY's pseudoterminal master file descriptor.
   * This operation is non-blocking. If no data is immediately available, it returns
   * an empty string result ({ data: "", done: false }).
   * If the child process associated with the PTY has exited, it returns a result
   * indicating completion ({ done: true, data: "" }).
   *
   * Prefer using `readableStream()` for more ergonomic consumption of output.
   *
   * @returns {PtyReadResult} An object containing the data read (as a string)
   *                         or an indication that the process has finished.
   * @throws {Error} If the Pty has already been closed (`close()` was called).
   * @throws {Error} If the underlying FFI call to `pty_read` fails and returns an error message.
   * @throws {Error} If the FFI call returns an unexpected status code.
   */
  read() {
    if (!this.#ptr) throw new Error("Pty is closed.");
    const resultPtrBuf = /* @__PURE__ */ new BigUint64Array(1);
    const status = getLibrary().symbols.pty_read(this.#ptr, resultPtrBuf);
    switch (status) {
      case 0: {
        const dataPtr = readPointerFromResultBuffer(resultPtrBuf);
        if (!dataPtr) {
          console.warn("pty_read returned status 0 but a null data pointer.");
          return {
            data: "",
            done: false,
          };
        }
        try {
          return {
            data: decodeCString(dataPtr),
            done: false,
          };
        } finally {
          freeRustString(getLibrary(), dataPtr);
        }
      }
      case 99: {
        const dataPtr = readPointerFromResultBuffer(resultPtrBuf);
        if (!dataPtr) {
          console.warn("could not read exit code");
          return {
            data: "",
            done: true,
          };
        }
        try {
          const exitCode = decodeCString(dataPtr);
          this.#exitCode = Number.parseInt(exitCode);
          return {
            data: "",
            done: true,
          };
        } finally {
          freeRustString(getLibrary(), dataPtr);
        }
      }
      case -1: {
        const errorMsg = readErrorAndFree(getLibrary(), resultPtrBuf);
        throw new Error(`Pty read failed: ${errorMsg}`);
      }
      default:
        throw new Error(`Pty read returned unexpected status: ${status}`);
    }
  }
  /**
   * Reads pending output from the PTY as RAW BYTES, without UTF-8 decoding.
   *
   * Unlike {@linkcode Pty.read}, chunk boundaries that split a multi-byte
   * UTF-8 codepoint are the caller's concern — decode with a streaming
   * decoder (`new TextDecoder(undefined, { fatal: false })` +
   * `decode(bytes, { stream: true })`) or hand the bytes to a consumer that
   * decodes itself (e.g. xterm.js `Terminal.write(Uint8Array)`). Interior
   * NUL bytes in the stream are passed through instead of erroring.
   *
   * Non-blocking: returns `{ data: empty, done: false }` when nothing is
   * pending.
   *
   * @returns The bytes read (empty when none) and whether the process ended.
   * @throws {Error} If the Pty has already been closed (`close()` was called).
   * @throws {Error} If the underlying FFI call fails.
   */
  readBytes() {
    if (!this.#ptr) throw new Error("Pty is closed.");
    const out = /* @__PURE__ */ new BigUint64Array(2);
    const status = getLibrary().symbols.pty_read_bytes(this.#ptr, out);
    switch (status) {
      case 0: {
        const len = Number(out[1]);
        const ptr = Deno.UnsafePointer.create(out[0]);
        if (!ptr || len === 0)
          return {
            data: /* @__PURE__ */ new Uint8Array(0),
            done: false,
          };
        try {
          const data = new Uint8Array(len);
          new Deno.UnsafePointerView(ptr).copyInto(data);
          return {
            data,
            done: false,
          };
        } finally {
          getLibrary().symbols.free_data(ptr, BigInt(len));
        }
      }
      case 99:
        this.#exitCode = Number(out[0]);
        return {
          data: /* @__PURE__ */ new Uint8Array(0),
          done: true,
        };
      case -1: {
        const errPtrBuf = new BigUint64Array([out[0]]);
        const errorMsg = readErrorAndFree(getLibrary(), errPtrBuf);
        throw new Error(`Pty readBytes failed: ${errorMsg}`);
      }
      default:
        throw new Error(`Pty readBytes returned unexpected status: ${status}`);
    }
  }
  /**
   * Writes the given data (as a string) to the PTY's input (master file descriptor).
   * This data is typically forwarded to the standard input of the child process.
   * The string is encoded as a null-terminated C string before being passed to the FFI.
   *
   * Prefer using `writableStream()` for potentially easier integration with other streams.
   *
   * @param data - The string data to write to the PTY.
   * @throws {Error} If the Pty has already been closed (`close()` was called).
   * @throws {Error} If the underlying FFI call to `pty_write` fails and returns an error message.
   */
  write(data) {
    if (!this.#ptr) throw new Error("Pty is closed.");
    const dataCStr = encodeCString(data);
    const errorPtrBuf = /* @__PURE__ */ new BigUint64Array(1);
    if (getLibrary().symbols.pty_write(this.#ptr, dataCStr, errorPtrBuf) === -1) {
      const errorMsg = readErrorAndFree(getLibrary(), errorPtrBuf);
      throw new Error(`Pty write failed: ${errorMsg}`);
    }
  }
  /**
   * Retrieves the current size (rows and columns) of the PTY terminal.
   * This involves an FFI call that returns the size information serialized
   * into a raw byte buffer (pointer + length).
   *
   * @returns {PtySize} An object containing the number of rows and columns.
   * @throws {Error} If the Pty has already been closed (`close()` was called).
   * @throws {Error} If the underlying FFI call to `pty_get_size` fails and returns an error message.
   * @throws {Error} If the FFI call succeeds but returns an invalid data pointer.
   */
  getSize() {
    if (!this.#ptr) throw new Error("Pty is closed.");
    const resultDataPtrBuf = /* @__PURE__ */ new BigUint64Array(1);
    const resultLenBuf = /* @__PURE__ */ new BigUint64Array(1);
    const errorPtrBuf = /* @__PURE__ */ new BigUint64Array(1);
    if (
      getLibrary().symbols.pty_get_size(this.#ptr, resultDataPtrBuf, resultLenBuf, errorPtrBuf) ===
      -1
    ) {
      const errorMsg = readErrorAndFree(getLibrary(), errorPtrBuf);
      throw new Error(`Pty getSize failed: ${errorMsg}`);
    }
    const dataPtr = readPointerFromResultBuffer(resultDataPtrBuf);
    const len = Number(resultLenBuf[0]);
    if (!dataPtr) throw new Error("Pty getSize succeeded but returned null data pointer.");
    try {
      return decodePointerLenData(dataPtr, len);
    } finally {
      freeRustData(getLibrary(), dataPtr, len);
    }
  }
  /**
   * Resizes the PTY terminal to the specified dimensions (rows and columns).
   * This typically sends a `SIGWINCH` signal to the foreground process group
   * in the PTY session on Unix-like systems. The size information is serialized
   * and passed to the FFI layer.
   *
   * @param size - An object containing the desired number of rows and columns.
   * @throws {Error} If the Pty has already been closed (`close()` was called).
   * @throws {Error} If the underlying FFI call to `pty_resize` fails and returns an error message.
   */
  resize(size) {
    if (!this.#ptr) throw new Error("Pty is closed.");
    size.pixel_height ??= 0;
    size.pixel_width ??= 0;
    const sizeData = encodePointerLenData(size);
    const sizeDataPtr = Deno.UnsafePointer.of(sizeData);
    const errorPtrBuf = /* @__PURE__ */ new BigUint64Array(1);
    if (
      getLibrary().symbols.pty_resize(
        this.#ptr,
        sizeDataPtr,
        BigInt(sizeData.length),
        errorPtrBuf,
      ) === -1
    ) {
      const errorMsg = readErrorAndFree(getLibrary(), errorPtrBuf);
      throw new Error(`Pty resize failed: ${errorMsg}`);
    }
  }
  /**
   * Closes the PTY master file descriptor and requests the Rust side to clean up
   * resources associated with this PTY instance. This includes dropping the Rust `Pty`
   * struct (which typically attempts to terminate the child process).
   *
   * After calling `close()`, the `Pty` object should be considered unusable, and
   * further method calls will throw an error (due to `#ptr` being null). It's safe
   * to call `close()` multiple times; subsequent calls after the first will have no effect.
   *
   * Note: This does *not* close the global FFI library instance (`LIBRARY`).
   * The library remains loaded until the Deno process exits.
   */
  close() {
    if (this.#ptr) {
      const ptrToClose = this.#ptr;
      this.#ptr = null;
      try {
        getLibrary().symbols.pty_close(ptrToClose);
      } catch (e) {
        console.error("Error during pty_close FFI call:", e);
      }
    }
  }
  /**
   * Returns a `ReadableStream<string>` that yields data read from the PTY.
   * The stream automatically handles polling the underlying PTY and closes
   * when the PTY process exits or errors when a read error occurs.
   *
   * Note: It's recommended to consume the stream promptly to avoid excessive
   * buffering within the stream controller.
   *
   * @returns {ReadableStream<string>} A readable stream of the PTY output.
   * @throws {Error} If the Pty is already closed when the stream is created (the stream will error immediately).
   */
  get readable() {
    if (!this.#ptr)
      return new ReadableStream({
        start(controller) {
          controller.error(/* @__PURE__ */ new Error("Pty is closed."));
        },
      });
    const ptyInstance = this;
    let isCancelled = false;
    let currentTimeoutId = void 0;
    function clearTimeoutIfActive() {
      if (currentTimeoutId !== void 0) {
        clearTimeout(currentTimeoutId);
        currentTimeoutId = void 0;
      }
    }
    return new ReadableStream({
      start(controller) {
        (async () => {
          while (!isCancelled)
            try {
              if (!ptyInstance.#ptr) {
                if (!isCancelled) controller.close();
                clearTimeoutIfActive();
                break;
              }
              const { data, done } = ptyInstance.read();
              await new Promise((resolve) => {
                clearTimeoutIfActive();
                currentTimeoutId = setTimeout(() => {
                  currentTimeoutId = void 0;
                  resolve();
                }, ptyInstance.#pollingIntervalMs);
              });
              if (done) {
                if (!isCancelled) controller.close();
                break;
              }
              if (data.length > 0) controller.enqueue(data);
            } catch (e) {
              if (!isCancelled) controller.error(e);
              clearTimeoutIfActive();
              break;
            }
        })();
      },
      cancel() {
        isCancelled = true;
        clearTimeoutIfActive();
      },
    });
  }
  /**
   * Returns a WritableStream<string> that writes data to the PTY's input.
   * Handles encoding the string data before passing it to the underlying write method.
   *
   * @returns {WritableStream<string>} A writable stream for the PTY input.
   * @throws {Error} If the Pty is already closed when the stream is created (the stream will error immediately).
   */
  get writable() {
    if (!this.#ptr)
      return new WritableStream({
        start(controller) {
          controller.error(/* @__PURE__ */ new Error("Pty is closed."));
        },
        write() {
          throw new Error("Pty is closed.");
        },
      });
    const ptyInstance = this;
    return new WritableStream({
      write(chunk, controller) {
        if (!ptyInstance.#ptr) {
          const err = /* @__PURE__ */ new Error("Pty is closed.");
          controller.error(err);
          throw err;
        }
        try {
          ptyInstance.write(chunk);
        } catch (e) {
          controller.error(e);
          throw e;
        }
      },
      close() {},
      abort(_reason) {},
    });
  }
  /**
   * Sets the interval for polling the PTY output when using `readableStream()`.
   * Lower values increase responsiveness but may use slightly more CPU.
   * Affects streams created *after* this call.
   * @param ms Polling interval in milliseconds. Defaults to 100. Must be positive.
   */
  setPollingInterval(ms) {
    if (ms > 0) this.#pollingIntervalMs = ms;
    else console.warn("Polling interval must be positive.");
  }
  /**
   * Gets the current polling interval used by `readableStream()`.
   * @returns Polling interval in milliseconds.
   */
  getPollingInterval() {
    return this.#pollingIntervalMs;
  }
};
//#endregion
export { Pty, instantiate, libName };
