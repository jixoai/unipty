/**
 * Deterministic child fixture: exits with the integer code given as argv[2]
 * (default 0). Used to observe non-zero Process Exit Results independently
 * from Terminal Stream completion.
 */

const raw = process.argv[2] === undefined ? "0" : process.argv[2];
const code = Number(raw);
process.exit(Number.isInteger(code) && code >= 0 && code <= 255 ? code : 0);
