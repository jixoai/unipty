/**
 * UniPty release catalog validation and three-state presentation derivation.
 *
 * Shared by scripts/build.mjs (renders the compatibility page at build time)
 * and scripts/check-site.mjs (recomputes expectations for static checks).
 * Evidence derivation NEVER runs in the browser: the compatibility page is
 * fully pre-rendered at build time from exactly one catalog artifact.
 *
 * Presentation law (documentation-site spec):
 * - exactly three states: verified | declared-unverified | not-targeted;
 * - "verified" requires an exact evidence match (exact runtime version,
 *   exact os/arch/libc, matching package snapshot and Core protocol major);
 * - runtime versions are never widened into ranges;
 * - catalog history is never merged (one catalog per build);
 * - absent evidence for a declared target => declared-unverified;
 * - a tuple not covered by any target declaration => not-targeted.
 */

/** Fixed presentation tuple grid (character-cell axes are normalized
 * Node/npm tokens: os from process.platform/npm os, arch from
 * process.arch/npm cpu, libc independent and Linux-only). */
export const TUPLE_GRID = [
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "linux", arch: "x64", libc: "glibc" },
  { os: "linux", arch: "arm64", libc: "glibc" },
  { os: "win32", arch: "x64" },
];

export const RUNTIMES = ["node", "bun", "deno"];

export const STATES = ["verified", "declared-unverified", "not-targeted"];

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const isStringArray = (v) => Array.isArray(v) && v.length > 0 && v.every(isNonEmptyString);
const isIso8601 = (v) =>
  isNonEmptyString(v) &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) &&
  !Number.isNaN(Date.parse(v));

function checkObject(value, errors, path) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push(`${path}: expected an object`);
    return false;
  }
  return true;
}

/**
 * Validate the catalog artifact shape against the release catalog contract.
 * Returns `{ ok: true, catalog }` or `{ ok: false, errors }`.
 * Malformed input MUST be rejected by the build (non-zero exit).
 */
export function validateCatalog(raw) {
  const errors = [];
  if (!checkObject(raw, errors, "catalog")) return { ok: false, errors };

  if (raw.catalogVersion !== 1) {
    errors.push("catalog.catalogVersion: expected 1");
  }
  if (!checkObject(raw.release, errors, "catalog.release")) {
    // shape error already recorded
  } else {
    if (!isNonEmptyString(raw.release.commit))
      errors.push("catalog.release.commit: expected a non-empty string");
    if (!isNonEmptyString(raw.release.tag))
      errors.push("catalog.release.tag: expected a non-empty string");
    // The aggregator always stamps the producing suite; a catalog without it
    // did not come from the release chain.
    if (!checkObject(raw.release.suite, errors, "catalog.release.suite")) {
      // shape error already recorded
    } else {
      if (!isNonEmptyString(raw.release.suite.id))
        errors.push("catalog.release.suite.id: expected a non-empty string");
      if (!isNonEmptyString(raw.release.suite.version))
        errors.push("catalog.release.suite.version: expected a non-empty string");
    }
  }
  // The aggregator emits released metadata snapshots under `metadata`; the
  // site normalizes them to a `packages` view for derivation without
  // touching the artifact bytes it copies unchanged.
  if (!Array.isArray(raw.metadata) || raw.metadata.length === 0) {
    errors.push("catalog.metadata: expected a non-empty array of released metadata snapshots");
  }
  if (!Array.isArray(raw.evidence)) {
    errors.push("catalog.evidence: expected an array");
  }
  if (errors.length > 0) return { ok: false, errors };

  const packageIdentities = new Set();
  const packages = [];
  raw.metadata.forEach((entry, i) => {
    const at = `catalog.metadata[${i}]`;
    if (!checkObject(entry, errors, at)) return;
    if (!isNonEmptyString(entry.packageName))
      errors.push(`${at}.packageName: expected a non-empty string`);
    if (!isNonEmptyString(entry.packageVersion))
      errors.push(`${at}.packageVersion: expected a non-empty string`);
    const pkg = entry.metadata;
    if (!checkObject(pkg, errors, `${at}.metadata`)) return;
    if (pkg.schema !== 1) errors.push(`${at}.schema: expected 1`);
    if (!checkObject(pkg.package, errors, `${at}.package`)) {
      // shape error already recorded
    } else {
      if (!isNonEmptyString(pkg.package.name))
        errors.push(`${at}.package.name: expected a non-empty string`);
      if (!isNonEmptyString(pkg.package.version))
        errors.push(`${at}.package.version: expected a non-empty string`);
    }
    if (!checkObject(pkg.backend, errors, `${at}.backend`)) {
      // shape error already recorded
    } else {
      if (!isNonEmptyString(pkg.backend.id))
        errors.push(`${at}.backend.id: expected a non-empty string`);
      if (!isNonEmptyString(pkg.backend.factoryExport))
        errors.push(`${at}.backend.factoryExport: expected a non-empty string`);
    }
    if (!checkObject(pkg.protocol, errors, `${at}.protocol`)) {
      // shape error already recorded
    } else if (
      !Array.isArray(pkg.protocol.core) ||
      pkg.protocol.core.length === 0 ||
      !pkg.protocol.core.every((n) => Number.isInteger(n) && n > 0)
    ) {
      errors.push(`${at}.protocol.core: expected a non-empty array of positive integers`);
    }
    if (!Array.isArray(pkg.targets) || pkg.targets.length === 0) {
      errors.push(`${at}.targets: expected a non-empty array`);
    } else {
      pkg.targets.forEach((target, j) => {
        const tAt = `${at}.targets[${j}]`;
        if (!checkObject(target, errors, tAt)) return;
        if (!RUNTIMES.includes(target.runtime))
          errors.push(`${tAt}.runtime: expected one of ${RUNTIMES.join(", ")}`);
        if (target.os !== undefined && !isStringArray(target.os))
          errors.push(`${tAt}.os: expected an array of non-empty strings`);
        if (target.arch !== undefined && !isStringArray(target.arch))
          errors.push(`${tAt}.arch: expected an array of non-empty strings`);
        if (target.libc !== undefined && !isStringArray(target.libc))
          errors.push(`${tAt}.libc: expected an array of non-empty strings`);
      });
    }
    if (pkg.provenance !== undefined) {
      if (!checkObject(pkg.provenance, errors, `${at}.provenance`)) {
        // shape error already recorded
      } else {
        if (!isNonEmptyString(pkg.provenance.kind))
          errors.push(`${at}.provenance.kind: expected a non-empty string`);
        if (!isNonEmptyString(pkg.provenance.substrate))
          errors.push(`${at}.provenance.substrate: expected a non-empty string`);
      }
    }
    if (
      isNonEmptyString(pkg.package?.name) &&
      isNonEmptyString(pkg.package?.version) &&
      isNonEmptyString(pkg.backend?.id)
    ) {
      const key = identityKey(pkg.package.name, pkg.package.version, pkg.backend.id);
      if (isNonEmptyString(entry.packageName) && entry.packageName !== pkg.package.name) {
        errors.push(
          `${at}: packageName ${entry.packageName} contradicts snapshot ${pkg.package.name}`,
        );
      }
      if (isNonEmptyString(entry.packageVersion) && entry.packageVersion !== pkg.package.version) {
        errors.push(
          `${at}: packageVersion ${entry.packageVersion} contradicts snapshot ${pkg.package.version}`,
        );
      }
      packageIdentities.add(key);
      packages.push(pkg);
    }
  });
  if (errors.length > 0) return { ok: false, errors };

  raw.evidence.forEach((ev, i) => {
    const at = `catalog.evidence[${i}]`;
    if (!checkObject(ev, errors, at)) return;
    if (!checkObject(ev.backend, errors, `${at}.backend`)) {
      // shape error already recorded
    } else {
      if (!isNonEmptyString(ev.backend.packageName))
        errors.push(`${at}.backend.packageName: expected a non-empty string`);
      if (!isNonEmptyString(ev.backend.packageVersion))
        errors.push(`${at}.backend.packageVersion: expected a non-empty string`);
      if (!isNonEmptyString(ev.backend.backendId))
        errors.push(`${at}.backend.backendId: expected a non-empty string`);
    }
    if (!checkObject(ev.core, errors, `${at}.core`)) {
      // shape error already recorded
    } else {
      if (!isNonEmptyString(ev.core.packageName))
        errors.push(`${at}.core.packageName: expected a non-empty string`);
      if (!isNonEmptyString(ev.core.packageVersion))
        errors.push(`${at}.core.packageVersion: expected a non-empty string`);
      if (!Number.isInteger(ev.core.protocolMajor) || ev.core.protocolMajor < 1)
        errors.push(`${at}.core.protocolMajor: expected a positive integer`);
    }
    if (!checkObject(ev.runtime, errors, `${at}.runtime`)) {
      // shape error already recorded
    } else {
      if (!isNonEmptyString(ev.runtime.name))
        errors.push(`${at}.runtime.name: expected a non-empty string`);
      if (!isNonEmptyString(ev.runtime.version))
        errors.push(`${at}.runtime.version: expected a non-empty string`);
    }
    if (!checkObject(ev.tuple, errors, `${at}.tuple`)) {
      // shape error already recorded
    } else {
      if (!isNonEmptyString(ev.tuple.os))
        errors.push(`${at}.tuple.os: expected a non-empty string`);
      if (!isNonEmptyString(ev.tuple.arch))
        errors.push(`${at}.tuple.arch: expected a non-empty string`);
      if (ev.tuple.libc !== undefined && !isNonEmptyString(ev.tuple.libc))
        errors.push(`${at}.tuple.libc: expected a non-empty string if present`);
    }
    if (!checkObject(ev.suite, errors, `${at}.suite`)) {
      // shape error already recorded
    } else {
      if (!isNonEmptyString(ev.suite.id))
        errors.push(`${at}.suite.id: expected a non-empty string`);
      if (!isNonEmptyString(ev.suite.version))
        errors.push(`${at}.suite.version: expected a non-empty string`);
    }
    if (!isNonEmptyString(ev.commit)) errors.push(`${at}.commit: expected a non-empty string`);
    if (!isIso8601(ev.verifiedAt)) errors.push(`${at}.verifiedAt: expected an ISO-8601 string`);
    if (ev.reportRef !== undefined && !isNonEmptyString(ev.reportRef))
      errors.push(`${at}.reportRef: expected a non-empty string if present`);

    if (
      isNonEmptyString(ev.backend?.packageName) &&
      isNonEmptyString(ev.backend?.packageVersion) &&
      isNonEmptyString(ev.backend?.backendId) &&
      !packageIdentities.has(
        identityKey(ev.backend.packageName, ev.backend.packageVersion, ev.backend.backendId),
      )
    ) {
      errors.push(
        `${at}: evidence backend identity ${ev.backend.packageName}@${ev.backend.packageVersion} (${ev.backend.backendId}) matches no package snapshot`,
      );
    }
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, catalog: { ...raw, packages } };
}

const identityKey = (name, version, backendId) => `${name}@${version}#${backendId}`;

const tupleKey = (tuple) => `${tuple.os ?? "*"}/${tuple.arch ?? "*"}/${tuple.libc ?? "-"}`;

const sameTuple = (a, b) =>
  (a.os ?? null) === (b.os ?? null) &&
  (a.arch ?? null) === (b.arch ?? null) &&
  (a.libc ?? null) === (b.libc ?? null);

/**
 * Does a target declaration cover this concrete tuple? A missing axis in the
 * declaration is a wildcard. libc is an independent Linux-only axis.
 */
const coversTuple = (target, tuple) => {
  if (target.os !== undefined && !target.os.includes(tuple.os)) return false;
  if (target.arch !== undefined && !target.arch.includes(tuple.arch)) return false;
  if (tuple.os === "linux" && target.libc !== undefined) {
    if (!target.libc.includes(tuple.libc)) return false;
  }
  return true;
};

/** Exact evidence match against a package snapshot and concrete tuple. */
const evidenceMatches = (pkg, runtime, tuple, ev) => {
  if (ev.backend.packageName !== pkg.package.name) return false;
  if (ev.backend.packageVersion !== pkg.package.version) return false;
  if (ev.backend.backendId !== pkg.backend.id) return false;
  if (!pkg.protocol.core.includes(ev.core.protocolMajor)) return false;
  if (ev.runtime.name !== runtime) return false;
  return sameTuple(ev.tuple, tuple);
};

/** Deterministic extra tuples: evidence tuples or fully-concrete declared
 * cross-products that the fixed grid does not already show. */
const extraTuplesFor = (targets, pkgEvidence) => {
  const known = new Set(TUPLE_GRID.map(tupleKey));
  const extras = [];
  const add = (tuple) => {
    const key = tupleKey(tuple);
    if (known.has(key)) return;
    known.add(key);
    extras.push(tuple);
  };
  for (const ev of pkgEvidence) add(ev.tuple);
  for (const target of targets) {
    if (target.os === undefined || target.arch === undefined) continue;
    for (const os of target.os) {
      // Linux native evidence requires a libc axis; a libc-less Linux
      // declaration displays on the npm-default glibc axis.
      const libcs = os === "linux" ? (target.libc ?? ["glibc"]) : [undefined];
      for (const arch of target.arch) {
        for (const libc of libcs) {
          add({ os, arch, ...(libc !== undefined ? { libc } : {}) });
        }
      }
    }
  }
  extras.sort((a, b) => tupleKey(a).localeCompare(tupleKey(b)));
  return extras;
};

/**
 * Derive the presentation model for one validated catalog: one flat row per
 * (package, tuple, covered runtime). Rows whose tuple is covered by no
 * target declaration carry state `not-targeted` and no runtime.
 *
 * Package order follows the catalog (the aggregator owns stable sorting);
 * the site never re-sorts, merges catalog history, widens runtime versions
 * into ranges, or recomputes evidence.
 */
export function derivePresentation(catalog) {
  const evidenceByPackage = new Map();
  for (const ev of catalog.evidence) {
    const key = identityKey(
      ev.backend.packageName,
      ev.backend.packageVersion,
      ev.backend.backendId,
    );
    if (!evidenceByPackage.has(key)) evidenceByPackage.set(key, []);
    evidenceByPackage.get(key).push(ev);
  }

  const routes = catalog.packages.map((pkg) => {
    const key = identityKey(pkg.package.name, pkg.package.version, pkg.backend.id);
    const pkgEvidence = evidenceByPackage.get(key) ?? [];
    const declaredRuntimes = [...new Set(pkg.targets.map((t) => t.runtime))];
    const tuples = [...TUPLE_GRID, ...extraTuplesFor(pkg.targets, pkgEvidence)];

    const rows = [];
    for (const tuple of tuples) {
      const covered = declaredRuntimes
        .map((runtime) => ({
          runtime,
          targets: pkg.targets.filter((t) => t.runtime === runtime),
        }))
        .filter(({ targets }) => targets.some((target) => coversTuple(target, tuple)));

      if (covered.length === 0) {
        rows.push({
          tuple,
          runtime: null,
          state: "not-targeted",
          evidence: [],
        });
        continue;
      }
      for (const { runtime } of covered) {
        const matched = pkgEvidence.filter((ev) => evidenceMatches(pkg, runtime, tuple, ev));
        rows.push({
          tuple,
          runtime,
          state: matched.length > 0 ? "verified" : "declared-unverified",
          evidence: matched.map((ev) => ({
            runtimeName: ev.runtime.name,
            runtimeVersion: ev.runtime.version,
            tuple: ev.tuple,
            suiteId: ev.suite.id,
            suiteVersion: ev.suite.version,
            commit: ev.commit,
            verifiedAt: ev.verifiedAt,
            reportRef: ev.reportRef ?? null,
          })),
        });
      }
    }

    return {
      packageName: pkg.package.name,
      packageVersion: pkg.package.version,
      backendId: pkg.backend.id,
      factoryExport: pkg.backend.factoryExport,
      protocolCore: pkg.protocol.core,
      provenance: pkg.provenance ?? null,
      targets: pkg.targets,
      rows,
      evidenceCount: pkgEvidence.length,
    };
  });

  // The artifact carries no catalog-level timestamp; the latest evidence
  // verification time is derived deterministically from its contents.
  const latestVerification = catalog.evidence.reduce(
    (max, ev) => (ev.verifiedAt > max ? ev.verifiedAt : max),
    "",
  );

  return {
    release: {
      commit: catalog.release.commit,
      tag: catalog.release.tag,
      generatedAt: latestVerification !== "" ? latestVerification : null,
    },
    routes,
  };
}
