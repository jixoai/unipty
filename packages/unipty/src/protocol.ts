/**
> Orthogonal intents (2026-08-20): Core protocol identity constant.
>
> Original request (2026-08-17): runtime-neutral PTY abstraction with
> developer-selectable Backends. This constant is the Core-side protocol major
> that Backend metadata must declare support for; it is independent from
 * package semver and the Backend metadata schema version.
 */

/** Major version of the Core-to-Backend protocol implemented by this package. */
export const UNIPTY_CORE_PROTOCOL_MAJOR = 1 as const;
