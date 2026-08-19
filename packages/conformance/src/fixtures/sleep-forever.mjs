/**
 * Deterministic child fixture: stays alive forever and produces no output.
 * Used for close-without-terminate, terminate-without-close, idempotency,
 * and invalid-argument probes.
 */

setInterval(() => {}, 1 << 30);
