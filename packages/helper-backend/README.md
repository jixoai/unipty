# @unipty/helper-backend

Build/development helper that generates **explicit Backend manifest modules**
from ordered candidate inputs. Not a runtime dependency: applications never
install it for production behaviour — it only writes source files.

[English](./README.md) | [简体中文](./README-zh.md) · [GitHub](https://github.com/jixoai/unipty) · [Docs](https://unipty.jixoai.com)

## Why

Bundlers cannot reliably collect arbitrary dynamic imports. Bundled
deployments of UniPty register Backends statically through
`defineUniPtyBackendManifest()` (see
[`@unipty/backend`](../backend/README.md#explicit-bundle-manifest)). This
helper generates exactly that module — hand-authorable, bundler-neutral
ESM/TypeScript — from explicit candidates, without ever importing a Backend
entry, calling a factory, or initializing native resources.

## CLI

```sh
npx unipty-helper-backend manifest \
  --candidate @unipty/backend-node-pty \
  --candidate @unipty/backend-bun \
  --out src/unipty-backends.ts
```

| Rule                        | Behaviour                                                              |
| --------------------------- | ---------------------------------------------------------------------- |
| `--candidate <pkg>`         | repeatable, required, order preserved                                  |
| `--out <file>` / `--stdout` | exactly one output mode; mutually exclusive                            |
| `--force`                   | required before overwriting an existing `--out` file                   |
| `--from <base>`             | optional resolution base; defaults to the current directory (CLI only) |
| diagnostics                 | standard error only; `--stdout` carries generated source only          |

The CLI never infers candidates from `package.json`, scans `node_modules`,
installs packages, imports Backend entry modules, or touches native/FFI
resources.

## Programmatic

```ts
import { generateUniPtyBackendManifestModule } from "@unipty/helper-backend";

const source = await generateUniPtyBackendManifestModule({
  candidates: ["@unipty/backend-node-pty"], // non-empty, ordered
  from: import.meta.url, // required: URL
});
// `source` is the module text; writing it is the caller's decision.
```

## Generated module contract

```ts
import metadata0 from "@unipty/backend-node-pty/unipty.metadata";
import { defineUniPtyBackendManifest } from "@unipty/backend";

export default defineUniPtyBackendManifest({
  entries: [
    {
      packageName: "@unipty/backend-node-pty",
      metadata: metadata0,
      load: () => import("@unipty/backend-node-pty"), // literal specifier only
    },
  ],
});
```

- Exactly one default export: the validated manifest.
- Static default imports of each candidate's `./unipty.metadata` (no
  embedded snapshots — identity stays with the installed package).
- Deferred loaders use literal dynamic-import specifiers so bundlers can see
  them; module evaluation loads metadata but never executes a loader,
  factory, or native initializer.
- No string-built specifiers, physical paths, or `node_modules` traversal —
  the same shape is hand-authorable without this helper.

## Testing

```sh
pnpm --filter @unipty/helper-backend test   # 24 scenarios incl. golden output + CLI laws
```
