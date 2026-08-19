/**
 * > Orthogonal intents (2026-08-20): deterministic vendoring build for
 * > `@unipty/backend-deno-sigma__pty-ffi`.
 *
 * Populates `vendor/` inside this package with:
 *
 * (a) `vendor/js/` — the complete `@sigma/pty-ffi@0.42.0/noinit` JavaScript
 *     closure (its whole JSR module graph, including `@denosaurs/plug` and the
 *     `@std/*` dependencies), mirrored from the local Deno cache and rewritten
 *     so every `jsr:` specifier becomes a relative file specifier. No `jsr:`
 *     specifier may remain anywhere in the vendored output.
 *
 * (b) `vendor/lib/<os>-<arch>/` — the native dynamic libraries from the
 *     `sigmaSd/deno-pty-ffi` GitHub release for 0.42.0, pinned by sha256.
 *
 * (c) `vendor/vendor-manifest.json` — a deterministic manifest recording every
 *     vendored file, its source URL, size, and sha256.
 *
 * Versions are pinned from the repository root `deno.lock` (read-only); the
 * script fails if the resolved JSR graph ever disagrees with those pins.
 *
 * Runner: `deno run -A scripts/vendor.sh.ts` (Deno >= 2.0).
 *   (default)  full vendoring (idempotent; rewrites identical bytes)
 *   --ensure   vendor only when `vendor/` is missing or inconsistent
 *   --check    verify `vendor/` integrity and scan `vendor/js/` + `dist/`
 *              for any remaining `jsr:` specifier (build gate)
 *
 * CI runs the default mode once before `tsdown`; the package `build` script
 * uses `--ensure` so an intact `vendor/` is not re-fetched.
 */

// ---------------------------------------------------------------------------
// Pinned substrate identity
// ---------------------------------------------------------------------------

const SUBSTRATE_PACKAGE = "@sigma/pty-ffi";
const SUBSTRATE_VERSION = "0.42.0";
const ENTRY_SPECIFIER = `jsr:${SUBSTRATE_PACKAGE}@${SUBSTRATE_VERSION}/noinit`;
const RELEASE_BASE =
  `https://github.com/sigmaSd/deno-pty-ffi/releases/download/${SUBSTRATE_VERSION}`;

/** Native release assets, pinned by sha256. */
interface NativeAsset {
  readonly os: string;
  readonly arch: string;
  readonly file: string;
  readonly sha256: string;
}

const NATIVE_ASSETS: readonly NativeAsset[] = [
  {
    os: "darwin",
    arch: "arm64",
    file: "libpty_arm64.dylib",
    sha256: "9ef80c02777bd7bd64ba5a1a0a52203ce1b7c216badf588059eb9e4a86b6d51c",
  },
  {
    os: "darwin",
    arch: "x64",
    file: "libpty_x86_64.dylib",
    sha256: "a293569b09dd50d2a69b8bb1cf637d3d95855e9882b2560994166307154ac22c",
  },
  {
    os: "linux",
    arch: "arm64",
    file: "libpty_aarch64.so",
    sha256: "d1ba3d53e3e18962faa76f903809420a7a8038bbd79524865479218caf7191e9",
  },
  {
    os: "linux",
    arch: "x64",
    file: "libpty_x86_64.so",
    sha256: "b69e40b779edd4978a83ff4a1fa52b570c713a5e826a721dc637246b4000c66a",
  },
  {
    os: "windows",
    arch: "x64",
    file: "pty.dll",
    sha256: "7f5e1247e1345563f189692c54892e9716de14f1205908bd480de618ae9b4d4a",
  },
];

const MANIFEST_SCHEMA = 1;

// ---------------------------------------------------------------------------
// Path helpers (posix-shaped; this script runs under Deno)
// ---------------------------------------------------------------------------

const scriptPath = fromFileUrl(new URL(import.meta.url));
const packageDir = join(dirname(scriptPath), "..");
const vendorDir = join(packageDir, "vendor");
const vendorJsDir = join(vendorDir, "js");
const vendorLibDir = join(vendorDir, "lib");
const manifestPath = join(vendorDir, "vendor-manifest.json");
const rootLockPath = join(packageDir, "..", "..", "deno.lock");

class VendorError extends Error {}

function fail(message: string): never {
  throw new VendorError(message);
}

function log(message: string): void {
  console.error(`vendor: ${message}`);
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  if (i <= 0) return i === 0 ? "/" : ".";
  return p.slice(0, i);
}

function join(...parts: string[]): string {
  return parts.join("/").replace(/\/{2,}/g, "/");
}

function relativeFrom(packageRelative: string): string {
  return join(packageDir, packageRelative);
}

/** Posix relative specifier from `fromDir` (dir) to `to` (file). */
function relativeSpec(fromDir: string, to: string): string {
  const a = fromDir.split("/").filter((s) => s.length > 0);
  const b = to.split("/").filter((s) => s.length > 0);
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const up = a.length - i;
  const rel = [...Array.from({ length: up }, () => ".."), ...b.slice(i)].join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function fromFileUrl(url: URL): string {
  let p = decodeURIComponent(url.pathname);
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
  return p;
}

async function sha256Bytes(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

// ---------------------------------------------------------------------------
// deno.lock pins
// ---------------------------------------------------------------------------

interface LockFile {
  readonly specifiers?: Record<string, string>;
  readonly jsr?: Record<string, unknown>;
}

/** package name -> pinned version, derived from the root deno.lock. */
async function loadPins(): Promise<{ pins: Map<string, string>; lockSha: string }> {
  let lockText: string;
  try {
    lockText = await Deno.readTextFile(rootLockPath);
  } catch {
    fail(`cannot read repository root deno.lock at ${rootLockPath}`);
  }
  const lockSha = await sha256Bytes(new TextEncoder().encode(lockText));
  let lock: LockFile;
  try {
    lock = JSON.parse(lockText);
  } catch {
    fail("root deno.lock is not valid JSON");
  }
  const pins = new Map<string, string>();
  const put = (name: string, version: string) => {
    const existing = pins.get(name);
    if (existing !== undefined && existing !== version) {
      fail(`root deno.lock pins ${name} to multiple versions (${existing}, ${version})`);
    }
    pins.set(name, version);
  };
  for (const [specifier, version] of Object.entries(lock.specifiers ?? {})) {
    const m = /^jsr:?\/?(@[^@/]+\/[^@/]+)@/.exec(specifier);
    if (m && typeof version === "string") put(m[1], version);
  }
  for (const key of Object.keys(lock.jsr ?? {})) {
    const m = /^(@[^@/]+\/[^@/]+)@([^/]+)$/.exec(key);
    if (m) put(m[1], m[2]);
  }
  if (pins.get(SUBSTRATE_PACKAGE) !== SUBSTRATE_VERSION) {
    fail(
      `root deno.lock does not pin ${SUBSTRATE_PACKAGE}@${SUBSTRATE_VERSION} (found ${
        pins.get(SUBSTRATE_PACKAGE) ?? "nothing"
      }); update the substrate constants first`,
    );
  }
  return { pins, lockSha };
}

// ---------------------------------------------------------------------------
// Module graph via `deno info --json --lock`
// ---------------------------------------------------------------------------

interface Graph {
  /** All https://jsr.io module URLs (TypeScript + asserted JSON), sorted. */
  readonly modules: string[];
  /** URL -> source text (cache footer stripped). */
  readonly sources: Map<string, string>;
  /** `<pkg>@<version>` -> exports map from its deno.json, when present. */
  readonly exports: Map<string, Record<string, string>>;
}

async function denoInfoJson(): Promise<string> {
  const tmpLock = await Deno.makeTempFile({ prefix: "unipty-vendor-lock-", suffix: ".json" });
  try {
    await Deno.copyFile(rootLockPath, tmpLock);
    const cmd = new Deno.Command(Deno.execPath(), {
      args: ["info", "--json", "--lock", tmpLock, ENTRY_SPECIFIER],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout, stderr } = await cmd.output();
    const text = stripAnsi(new TextDecoder().decode(stdout));
    const start = text.search(/^{$/m);
    if (code !== 0 || start < 0) {
      fail(
        `deno info failed (exit ${code}): ${
          stripAnsi(new TextDecoder().decode(stderr)).slice(0, 2000)
        }`,
      );
    }
    return text.slice(start);
  } finally {
    await Deno.remove(tmpLock).catch(() => {});
  }
}

async function discoverDenoDir(): Promise<string> {
  const fromEnv = Deno.env.get("DENO_DIR");
  if (fromEnv) return fromEnv;
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["info"],
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout } = await cmd.output();
  const m = /DENO_DIR location:\s*(\S+)/.exec(stripAnsi(new TextDecoder().decode(stdout)));
  if (!m) fail("cannot discover DENO_DIR; set DENO_DIR explicitly");
  return m[1];
}

/** Map cached jsr.io module URLs to cache files via the `denoCacheMetadata` footer. */
async function mapCache(denoDir: string): Promise<Map<string, string>> {
  const cacheDir = join(denoDir, "remote", "https", "jsr.io");
  const map = new Map<string, string>();
  let entries: Deno.DirEntry[];
  try {
    entries = [...Deno.readDirSync(cacheDir)];
  } catch {
    return map;
  }
  for (const entry of entries) {
    if (!entry.isFile || !/^[0-9a-f]{64}$/.test(entry.name)) continue;
    const path = join(cacheDir, entry.name);
    let text: string;
    try {
      text = await Deno.readTextFile(path);
    } catch {
      continue;
    }
    const m = /\/\/ denoCacheMetadata=(\{.*\})\s*$/.exec(text);
    if (!m) continue;
    try {
      const meta = JSON.parse(m[1]) as { url?: string };
      if (typeof meta.url === "string" && meta.url.startsWith("https://jsr.io/")) {
        map.set(meta.url, path);
      }
    } catch {
      // Not a deno cache metadata footer; ignore.
    }
  }
  return map;
}

/** `https://jsr.io/@scope/pkg/<version>/rest` -> [`@scope/pkg`, `<version>`]. */
function urlPackageVersion(url: string): [string, string] {
  const rest = url.slice("https://jsr.io/".length);
  const parts = rest.split("/");
  if (parts.length < 3 || !parts[0].startsWith("@")) {
    fail(`unexpected jsr.io URL shape: ${url}`);
  }
  return [`${parts[0]}/${parts[1]}`, parts[2]];
}

async function loadGraph(pins: Map<string, string>): Promise<Graph> {
  const info = JSON.parse(await denoInfoJson()) as {
    modules?: { specifier: string; mediaType?: string }[];
  };
  const urls = (info.modules ?? [])
    .filter((m) =>
      m.specifier.startsWith("https://jsr.io/") &&
      (m.mediaType === "TypeScript" || m.mediaType === "Json")
    )
    .map((m) => m.specifier)
    .sort();
  if (urls.length === 0) fail("deno info returned no jsr.io modules");

  for (const url of urls) {
    const [pkg, ver] = urlPackageVersion(url);
    const pinned = pins.get(pkg);
    if (pinned === undefined) {
      fail(`module ${url} belongs to ${pkg}, which the root deno.lock does not pin`);
    }
    if (ver !== pinned) {
      fail(
        `module ${url} resolves ${ver} but the root deno.lock pins ${pkg}@${pinned}; ` +
          `clear the Deno remote cache for this package and re-run`,
      );
    }
  }

  const denoDir = await discoverDenoDir();
  const cache = await mapCache(denoDir);
  const sources = new Map<string, string>();
  const exports = new Map<string, Record<string, string>>();

  // Exports maps also live in cached versioned `<pkg>/<version>_meta.json`
  // files; harvest them so root/subpath `jsr:` specifiers resolve offline.
  for (const [url, cached] of cache) {
    const m = /^https:\/\/jsr\.io\/(@[^/]+\/[^/]+)\/([^/]+)_meta\.json$/.exec(url);
    if (!m) continue;
    try {
      const text = (await Deno.readTextFile(cached)).replace(
        /\/\/ denoCacheMetadata=\{.*\}\s*$/,
        "",
      );
      const meta = JSON.parse(text) as { exports?: Record<string, string> };
      if (meta.exports) exports.set(`${m[1]}@${m[2]}`, meta.exports);
    } catch {
      // Unusable cache entry; ignore.
    }
  }

  for (const url of urls) {
    const cached = cache.get(url);
    if (!cached) {
      fail(
        `module ${url} is not in the Deno cache (${cache.size} jsr.io URLs mapped); ` +
          `re-run this script so \`deno info\` can populate the cache first`,
      );
    }
    let text = await Deno.readTextFile(cached);
    const footer = /\/\/ denoCacheMetadata=\{.*\}\s*$/.exec(text);
    if (footer) text = text.slice(0, footer.index).replace(/\n$/, "");
    sources.set(url, text);
    if (url.endsWith("/deno.json")) {
      try {
        const cfg = JSON.parse(text) as { exports?: Record<string, string> };
        const [pkg, ver] = urlPackageVersion(url);
        if (cfg.exports) exports.set(`${pkg}@${ver}`, cfg.exports);
      } catch {
        // Not a package config; ignore.
      }
    }
  }
  return { modules: urls, sources, exports };
}

// ---------------------------------------------------------------------------
// jsr: specifier resolution and rewriting
// ---------------------------------------------------------------------------

interface JsrSpecifier {
  readonly pkg: string;
  readonly version: string;
  readonly subpath: string; // "" for the root export
}

function parseJsrSpecifier(spec: string, pins: Map<string, string>): JsrSpecifier | undefined {
  const body = spec.replace(/^jsr:\/?/, "");
  const m = /^(@[^@/]+\/[^@/]+)(?:@([^/]+))?(?:\/(.*))?$/.exec(body);
  if (!m) return undefined;
  const pkg = m[1];
  const versionRange = m[2];
  const subpath = m[3] ?? "";
  const pinned = pins.get(pkg);
  if (pinned === undefined) return undefined;
  if (versionRange !== undefined && !satisfiesRange(pinned, versionRange)) {
    fail(
      `specifier ${spec} wants ${versionRange} but the root deno.lock pins ${pkg}@${pinned}`,
    );
  }
  return { pkg, version: pinned, subpath };
}

/** Minimal semver-range check covering the `^` ranges used by this closure. */
function satisfiesRange(pinned: string, range: string): boolean {
  if (range === "*" || range === "" || range === pinned) return true;
  const m = /^\^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(range);
  if (!m) return false;
  const parts = pinned.split(".").map((n) => Number.parseInt(n, 10));
  if (parts[0] !== Number(m[1])) return false;
  if (m[2] !== undefined && parts[1] !== Number(m[2])) return false;
  return true;
}

function resolveModuleUrl(graph: Graph, spec: JsrSpecifier): string | undefined {
  const base = `https://jsr.io/${spec.pkg}/${spec.version}`;
  const files = new Set(graph.modules.filter((u) => !u.endsWith(".json")));
  const candidates = spec.subpath === ""
    ? [`${base}/mod.ts`, `${base}/index.ts`, `${base}/mod.js`, `${base}/index.js`]
    : [
      `${base}/${spec.subpath}`,
      `${base}/${spec.subpath}.ts`,
      `${base}/${spec.subpath}/mod.ts`,
      `${base}/${spec.subpath}.js`,
    ];
  for (const candidate of candidates) {
    if (files.has(candidate)) return candidate;
  }
  const exports = graph.exports.get(`${spec.pkg}@${spec.version}`);
  const entry = exports?.[spec.subpath === "" ? "." : `./${spec.subpath}`];
  if (typeof entry === "string") {
    const target = `${base}/${entry.replace(/^\.\//, "")}`;
    if (files.has(target)) return target;
  }
  return undefined;
}

function vendorPathFor(url: string): string {
  return join(vendorJsDir, url.slice("https://".length));
}

/** Rewrite every `"jsr:..."` literal in `source` to a relative specifier. */
function rewriteSource(
  source: string,
  fromVendorFile: string,
  graph: Graph,
  pins: Map<string, string>,
): string {
  for (const match of source.matchAll(/"(jsr:[^"]*)"/g)) {
    const literal = match[1];
    const spec = parseJsrSpecifier(literal, pins);
    if (!spec) {
      fail(`unresolvable jsr: specifier "${literal}" (referenced from ${fromVendorFile})`);
    }
    const target = resolveModuleUrl(graph, spec);
    if (!target) {
      fail(
        `jsr: specifier "${literal}" does not resolve into the vendored graph ` +
          `(referenced from ${fromVendorFile})`,
      );
    }
    source = source.replaceAll(`"${literal}"`, `"${relativeSpec(dirname(fromVendorFile), vendorPathFor(target))}"`);
  }
  return source;
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

interface ManifestFile {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly sourceUrl: string;
}

interface ManifestLib extends ManifestFile {
  readonly os: string;
  readonly arch: string;
}

interface Manifest {
  readonly schema: number;
  readonly generatedBy: string;
  readonly substrate: {
    readonly package: string;
    readonly version: string;
    readonly entry: string;
    readonly releaseBase: string;
  };
  readonly pins: {
    readonly lockFile: string;
    readonly lockSha256: string;
    readonly jsr: Record<string, string>;
  };
  readonly js: { readonly count: number; readonly files: ManifestFile[] };
  readonly libs: ManifestLib[];
}

async function writeBytes(path: string, data: Uint8Array): Promise<void> {
  await Deno.mkdir(dirname(path), { recursive: true });
  await Deno.writeFile(path, data);
}

/**
 * Rewrite a vendored JSON module (a JSR package `deno.json`).
 *
 * Its `imports` map may carry `jsr:` values; resolvable ones are rewritten to
 * relative specifiers and unresolvable ones (e.g. a package root whose mod.ts
 * is not part of this closure) are pruned. The `imports` map is inert in the
 * vendored layout — only fields like `version` are read by the closure — so
 * pruning preserves runtime behaviour while keeping the output `jsr:`-free.
 */
function rewriteJsonSource(
  source: string,
  fromVendorFile: string,
  graph: Graph,
  pins: Map<string, string>,
): string {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    fail(`vendored JSON module is not valid JSON: ${fromVendorFile}`);
  }
  if (value === null || typeof value !== "object") return source;
  const record = value as Record<string, unknown>;
  if (record.imports !== undefined && record.imports !== null && typeof record.imports === "object") {
    const imports = { ...(record.imports as Record<string, unknown>) };
    for (const key of Object.keys(imports)) {
      const spec = imports[key];
      if (typeof spec !== "string" || !spec.startsWith("jsr:")) continue;
      const parsed = parseJsrSpecifier(spec, pins);
      const target = parsed === undefined ? undefined : resolveModuleUrl(graph, parsed);
      if (target === undefined) {
        delete imports[key];
        continue;
      }
      imports[key] = relativeSpec(dirname(fromVendorFile), vendorPathFor(target));
    }
    if (Object.keys(imports).length === 0) {
      delete record.imports;
    } else {
      record.imports = imports;
    }
  }
  return `${JSON.stringify(record, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Vendoring steps
// ---------------------------------------------------------------------------

async function vendorJs(graph: Graph, pins: Map<string, string>): Promise<ManifestFile[]> {
  const files: ManifestFile[] = [];
  for (const url of graph.modules) {
    const source = graph.sources.get(url);
    if (source === undefined) fail(`missing cached source for ${url}`);
    const target = vendorPathFor(url);
    const rewritten = url.endsWith(".ts")
      ? rewriteSource(source, target, graph, pins)
      : url.endsWith(".json")
      ? rewriteJsonSource(source, target, graph, pins)
      : source;
    if (/jsr:/.test(rewritten)) {
      fail(`a jsr: specifier survived rewriting while producing ${target}`);
    }
    const data = new TextEncoder().encode(rewritten);
    await writeBytes(target, data);
    files.push({
      path: relativeSpec(packageDir, target).replace(/^\.\//, ""),
      sha256: await sha256Bytes(data),
      bytes: data.length,
      sourceUrl: url,
    });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return files;
}

async function fetchAsset(asset: NativeAsset): Promise<Uint8Array> {
  const url = `${RELEASE_BASE}/${asset.file}`;
  const response = await fetch(url);
  if (!response.ok) fail(`download failed for ${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function vendorLibs(): Promise<ManifestLib[]> {
  const libs: ManifestLib[] = [];
  for (const asset of NATIVE_ASSETS) {
    const url = `${RELEASE_BASE}/${asset.file}`;
    const target = join(vendorLibDir, `${asset.os}-${asset.arch}`, asset.file);
    let data: Uint8Array | undefined;
    try {
      const existing = await Deno.readFile(target);
      if (existing.length > 0 && await sha256Bytes(existing) === asset.sha256) {
        data = existing;
      }
    } catch {
      // Not vendored yet.
    }
    if (data === undefined) {
      log(`downloading ${asset.file} -> ${relativeSpec(packageDir, target)}`);
      data = await fetchAsset(asset);
    }
    const sha = await sha256Bytes(data);
    if (sha !== asset.sha256) {
      fail(
        `sha256 mismatch for ${asset.file}: expected ${asset.sha256}, got ${sha} ` +
          `(the release asset changed; re-pin deliberately)`,
      );
    }
    await writeBytes(target, data);
    libs.push({
      path: relativeSpec(packageDir, target).replace(/^\.\//, ""),
      sha256: sha,
      bytes: data.length,
      sourceUrl: url,
      os: asset.os,
      arch: asset.arch,
    });
  }
  libs.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return libs;
}

async function runFull(): Promise<void> {
  const { pins, lockSha } = await loadPins();
  const graph = await loadGraph(pins);
  log(`vendoring ${graph.modules.length} JSR modules pinned by the root deno.lock`);
  const jsFiles = await vendorJs(graph, pins);
  const libs = await vendorLibs();
  const pinsRecord: Record<string, string> = {};
  for (const [name, version] of [...pins].sort(([a], [b]) => (a < b ? -1 : 1))) {
    pinsRecord[name] = version;
  }
  const manifest: Manifest = {
    schema: MANIFEST_SCHEMA,
    generatedBy: "scripts/vendor.sh.ts",
    substrate: {
      package: SUBSTRATE_PACKAGE,
      version: SUBSTRATE_VERSION,
      entry: ENTRY_SPECIFIER,
      releaseBase: RELEASE_BASE,
    },
    pins: {
      lockFile: relativeSpec(packageDir, rootLockPath).replace(/^\.\//, ""),
      lockSha256: lockSha,
      jsr: pinsRecord,
    },
    js: { count: jsFiles.length, files: jsFiles },
    libs,
  };
  await writeBytes(manifestPath, new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`));
  log(
    `vendored ${jsFiles.length} modules -> vendor/js and ${libs.length} libraries -> vendor/lib; manifest written`,
  );
}

// ---------------------------------------------------------------------------
// Verification (--check / --ensure)
// ---------------------------------------------------------------------------

async function readManifest(): Promise<Manifest | undefined> {
  try {
    const manifest = JSON.parse(await Deno.readTextFile(manifestPath)) as Manifest;
    if (manifest.schema !== MANIFEST_SCHEMA) {
      fail(`vendor manifest schema ${manifest.schema} != ${MANIFEST_SCHEMA}`);
    }
    return manifest;
  } catch (e) {
    if (e instanceof VendorError) throw e;
    return undefined;
  }
}

async function verifyVendor(manifest: Manifest): Promise<void> {
  const entries: ManifestFile[] = [...manifest.js.files, ...manifest.libs];
  for (const entry of entries) {
    const abs = relativeFrom(entry.path);
    let data: Uint8Array;
    try {
      data = await Deno.readFile(abs);
    } catch {
      fail(`vendored file missing: ${entry.path}`);
    }
    if (data.length !== entry.bytes || await sha256Bytes(data) !== entry.sha256) {
      fail(`vendored file corrupted: ${entry.path}`);
    }
  }
  const { lockSha } = await loadPins();
  if (manifest.pins.lockSha256 !== lockSha) {
    fail("root deno.lock changed since vendoring; re-run build:vendor to refresh the closure");
  }
  if (manifest.substrate.version !== SUBSTRATE_VERSION) {
    fail("vendor manifest substrate version disagrees with the script constants");
  }
}

async function* walkFiles(root: string): AsyncGenerator<string> {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of Deno.readDirSync(current)) {
      const child = join(current, entry.name);
      if (entry.isDirectory) stack.push(child);
      else if (entry.isFile) yield child;
    }
  }
}

/** Scan directories (package-relative) for any remaining `jsr:` specifier. */
async function scanForJsr(
  dirs: { path: string; label: string; required: boolean }[],
): Promise<void> {
  const offenders: string[] = [];
  for (const dir of dirs) {
    const abs = relativeFrom(dir.path);
    let stat: Deno.FileInfo | undefined;
    try {
      stat = await Deno.stat(abs);
    } catch {
      stat = undefined;
    }
    if (!stat?.isDirectory) {
      if (dir.required) fail(`${dir.label} directory missing: ${dir.path}`);
      continue;
    }
    for await (const file of walkFiles(abs)) {
      if (!/\.(ts|js|mjs|cjs|json)$/.test(file)) continue;
      const text = await Deno.readTextFile(file);
      if (/jsr:/.test(text)) offenders.push(file);
    }
  }
  if (offenders.length > 0) {
    const unique = [...new Set(offenders)].sort().map((p) => relativeSpec(packageDir, p));
    fail(`jsr: specifiers remain in published output:\n  ${unique.join("\n  ")}`);
  }
}

async function runCheck(): Promise<void> {
  const manifest = await readManifest();
  if (manifest === undefined) fail(`vendor manifest missing; run build:vendor first`);
  await verifyVendor(manifest);
  await scanForJsr([
    { path: "vendor/js", label: "vendored JS closure", required: true },
    { path: "dist", label: "built dist", required: true },
  ]);
  log(`check ok: ${manifest.js.count} modules + ${manifest.libs.length} libs, no jsr: specifiers`);
}

async function runEnsure(): Promise<void> {
  let intact = false;
  try {
    const manifest = await readManifest();
    if (manifest !== undefined) {
      await verifyVendor(manifest);
      intact = true;
    }
  } catch (e) {
    if (!(e instanceof VendorError)) throw e;
    intact = false;
  }
  if (intact) {
    log("vendor/ intact; skipping re-vendoring");
  } else {
    await runFull();
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const mode = Deno.args[0] ?? "";
try {
  switch (mode) {
    case "":
      await runFull();
      break;
    case "--ensure":
      await runEnsure();
      break;
    case "--check":
      await runCheck();
      break;
    default:
      fail(`unknown option ${mode}; usage: vendor.sh.ts [--ensure|--check]`);
  }
} catch (e) {
  if (e instanceof VendorError) {
    console.error(`vendor: ${e.message}`);
    Deno.exit(1);
  }
  throw e;
}
