/**
> Orthogonal intents (2026-08-20): opaque Backend capability token type.
>
> Original request (2026-08-17): Backend-specific operations must extend the
> public Pty without widening the common API. A token is an opaque singleton
 * object; Core matches tokens by object identity only, with no string-name
 * registry or fallback, so duplicate loaded package copies are intentionally
 * incompatible.
 */

declare const capabilityTokenBrand: unique symbol;

/** Opaque, type-safe handle to a Backend-owned capability value. */
export type CapabilityToken<T> = {
  readonly [capabilityTokenBrand]: T;
};

/**
 * Create a Backend capability token. Backend packages export exactly one
 * stable singleton per capability; the returned object is compared by
 * identity during `pty.capability(token)` lookup.
 */
export function defineCapabilityToken<T>(): CapabilityToken<T> {
  // The brand lives only in the type system; the runtime value is an opaque
  // empty object whose identity is the whole contract.
  return {} as CapabilityToken<T>;
}
