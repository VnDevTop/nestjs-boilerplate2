import { registerAs } from '@nestjs/config';

/**
 * Brute-force protection configuration namespace.
 *
 * Account lockout policy applied on top of the generic per-IP rate limiting:
 * after `maxAttempts` failed login attempts within the sliding window, the
 * account is locked for `lockoutSeconds`. The lock duration doubles on each
 * subsequent lockout (`progressive`) and never exceeds `maxLockoutSeconds`.
 *
 * Configuration is read from environment variables:
 * - BRUTE_FORCE_MAX_ATTEMPTS: failed attempts allowed before lockout (default: 5)
 * - BRUTE_FORCE_WINDOW_SECONDS: sliding window in seconds (default: 900 = 15 min)
 * - BRUTE_FORCE_LOCKOUT_SECONDS: base lock duration in seconds (default: 900 = 15 min)
 * - BRUTE_FORCE_MAX_LOCKOUT_SECONDS: upper bound for lock duration (default: 86400 = 24h)
 */
export interface BruteForceProtectionOptions {
  /** Failed attempts allowed within the window before the account gets locked. */
  maxAttempts: number;
  /** Sliding window in seconds during which failures are counted. */
  windowSeconds: number;
  /** Base lock duration in seconds applied on the first lockout. */
  lockoutSeconds: number;
  /** Maximum lock duration in seconds (progressive lockout cap). */
  maxLockoutSeconds: number;
}

export const bruteForceConfig = registerAs<BruteForceProtectionOptions>(
  'bruteForce',
  () => ({
    maxAttempts: Number(process.env.BRUTE_FORCE_MAX_ATTEMPTS ?? 5),
    windowSeconds: Number(process.env.BRUTE_FORCE_WINDOW_SECONDS ?? 900),
    lockoutSeconds: Number(process.env.BRUTE_FORCE_LOCKOUT_SECONDS ?? 900),
    maxLockoutSeconds: Number(process.env.BRUTE_FORCE_MAX_LOCKOUT_SECONDS ?? 86400),
  }),
);
