## Purpose

Let applications acquire a compatible ready Backend deterministically while
preserving a manual import path and separating resolution from native effects.

## ADDED Requirements

### Requirement: Side-effect-free Backend Metadata Protocol

An official Backend package SHALL expose a side-effect-free
`./unipty.metadata` export with normalized package identity, Backend identity,
factory export name, supported Core protocol majors, target declarations, and
optional provenance. Metadata SHALL NOT initialize native resources, establish a
connection, assert verified support, expose asset layout, or claim official
status. The metadata subpath SHALL default-export one metadata value.

#### Scenario: Metadata inspection does not initialize a Backend

- **WHEN** the acquisition layer imports an official metadata subpath
- **THEN** it can validate declaration compatibility without importing the
  Backend entry module, calling its factory, or initializing native resources

### Requirement: Caller-rooted pure resolution and inspection

`resolveUniPtyBackend(packageName, { from })` SHALL process exactly one package
specifier and SHALL require a caller-owned `from` URL. It SHALL return a
discriminated resolved or unresolved report without importing modules. Only a
resolved report SHALL be accepted by `inspectUniPtyBackend()`, which SHALL return
compatible, incompatible, metadata-missing, or metadata-invalid without factory
initialization. Neither stage SHALL write warnings or scan `node_modules`.

#### Scenario: A missing package is not reported as missing metadata

- **WHEN** pure resolution cannot locate a requested package from the caller
  base
- **THEN** the result is unresolved and metadata inspection is not invoked

### Requirement: Deterministic AutoResolve selection

`autoResolveUniPtyBackend()` SHALL first analyze the current runtime. It SHALL
process explicit `candidates` in caller order, issue a structured unavailable
candidate warning when configured candidates cannot resolve or inspect, and only
then derive fallback candidates from the consumer's dependency declarations.
Fallback selection SHALL require exactly one compatible candidate; multiple
compatible candidates SHALL report ambiguity rather than infer priority from
dependency or filesystem order.

#### Scenario: Explicit candidate order wins

- **WHEN** two configured candidates are compatible for the current target
- **THEN** AutoResolve selects the first compatible candidate in the supplied
  array order

### Requirement: Selection ends fallback before initialization

After selection, AutoResolve SHALL import only the selected package, look up only
its declared factory export, and await only that factory's readiness. Import,
factory-export, factory-call, and readiness failures SHALL reject with a
structured `backend-initialization` error that preserves package, stage,
inspection report, and cause; AutoResolve SHALL not silently try another
candidate. Manual dynamic import and official factory invocation SHALL remain a
first-class acquisition path.

#### Scenario: Selected factory failure is terminal

- **WHEN** the chosen package's factory rejects while becoming ready
- **THEN** AutoResolve rejects with `backend-initialization` and does not
  initialize a lower-priority candidate

### Requirement: Explicit bundle manifest

Bundled callers SHALL be able to supply an explicit immutable Backend Manifest
of static metadata and deferred loaders. Manifest construction SHALL reject an
empty entry set, duplicate package identities, metadata/package mismatches,
missing factory exports, and non-callable loaders without invoking a loader.
When supplied, the manifest SHALL replace runtime package resolution while
preserving the same selection and selected-initialization rules.

#### Scenario: Only a selected manifest loader executes

- **WHEN** a manifest contains multiple compatible entries and one is selected
- **THEN** the selected entry loader executes after selection and every other
  loader remains uncalled

### Requirement: Manifest-source helper

`@unipty/helper-backend` SHALL generate a hand-authorable ESM or TypeScript
manifest module only from explicit ordered candidate inputs. Its CLI SHALL
require one or more `--candidate` arguments and exactly one of `--out` or
`--stdout`; replacement SHALL require `--force`. The helper SHALL not infer
candidates, scan installations, import Backend entry modules, initialize native
resources, copy assets, or become an application runtime dependency.

#### Scenario: Source generation is side-effect-limited

- **WHEN** the helper generates a manifest for supplied candidates
- **THEN** it emits metadata imports and literal deferred loaders without
  invoking a loader, factory, or native initializer
