import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import { LoginAttempt } from './entities/login-attempt.entity.js';
import { BruteForceProtectionOptions } from '../../config/brute-force.config.js';

/**
 * Brute-force protection service.
 *
 * Implements the account lockout policy on top of the generic per-IP rate
 * limiting enforced by the `ThrottlerGuard`:
 *
 * - After `maxAttempts` failed login attempts within a sliding window
 *   (`windowSeconds`), the identifier (email) is locked until `lockoutSeconds`
 *   elapse. The lock duration doubles on each subsequent lockout and is capped
 *   at `maxLockoutSeconds` (progressive lockout).
 * - A successful login resets the failure counter.
 * - While locked, auth endpoints reject early with `429 Too Many Requests`.
 *
 * @class BruteForceProtectionService
 */
@Injectable()
export class BruteForceProtectionService {
  private readonly logger = new Logger(BruteForceProtectionService.name);

  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly baseLockDurationMs: number;
  private readonly maxLockDurationMs: number;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(LoginAttempt)
    private readonly loginAttemptRepository: Repository<LoginAttempt>,
  ) {
    const config = this.configService.get<BruteForceProtectionOptions>('bruteForce') ?? {
      maxAttempts: 5,
      windowSeconds: 900,
      lockoutSeconds: 900,
      maxLockoutSeconds: 86400,
    };

    this.maxAttempts = config.maxAttempts ?? 5;
    this.windowMs = (config.windowSeconds ?? 900) * 1000;
    this.baseLockDurationMs = (config.lockoutSeconds ?? 900) * 1000;
    this.maxLockDurationMs = (config.maxLockoutSeconds ?? 86400) * 1000;
  }

  /**
   * Returns whether the identifier (email) is currently locked out.
   *
   * @param identifier - Normalized email identifier.
   * @returns True when the account is locked (lockedUntil in the future).
   */
  async isLocked(identifier: string): Promise<boolean> {
    const attempt = await this.loginAttemptRepository.findOne({
      where: { identifier },
    });

    if (!attempt?.lockedUntil) {
      return false;
    }

    if (attempt.lockedUntil.getTime() > Date.now()) {
      return true;
    }

    // Lock expired -> reset the stored failure state.
    await this.resetFailedAttempts(identifier);
    return false;
  }

  /**
   * Registers a failed login attempt and applies the lockout policy.
   *
   * @param identifier - Normalized email identifier.
   * @returns The failure count after the attempt and the resulting lock deadline.
   */
  async registerFailedAttempt(identifier: string): Promise<{
    failedCount: number;
    lockedUntil: Date | null;
  }> {
    const now = new Date();
    let attempt = await this.loginAttemptRepository.findOne({
      where: { identifier },
    });

    if (!attempt) {
      attempt = this.loginAttemptRepository.create({
        identifier,
        failedCount: 0,
        lockoutCount: 0,
      });
    }

    // Sliding window: drop counters when the last failure is older than the window.
    if (
      attempt.lastFailedAt &&
      now.getTime() - attempt.lastFailedAt.getTime() > this.windowMs
    ) {
      attempt.failedCount = 0;
      attempt.lockoutCount = 0;
      attempt.lockedUntil = null;
    }

    attempt.failedCount += 1;
    attempt.lastFailedAt = now;

    if (attempt.failedCount >= this.maxAttempts) {
      const lockDurationMs = Math.min(
        this.baseLockDurationMs * Math.pow(2, attempt.lockoutCount),
        this.maxLockDurationMs,
      );
      attempt.lockoutCount += 1;
      attempt.lockedUntil = new Date(now.getTime() + lockDurationMs);
      attempt.failedCount = 0;

      await this.loginAttemptRepository.save(attempt);
      this.logger.warn(
        `Account temporarily locked after ${this.maxAttempts} failed attempts: ${identifier}`,
      );

      return { failedCount: 0, lockedUntil: attempt.lockedUntil };
    }

    attempt.lockedUntil = null;
    await this.loginAttemptRepository.save(attempt);

    return { failedCount: attempt.failedCount, lockedUntil: null };
  }

  /**
   * Resets the failure counter and lockout state after a successful login.
   *
   * @param identifier - Normalized email identifier.
   */
  async resetFailedAttempts(identifier: string): Promise<void> {
    await this.loginAttemptRepository.update(
      { identifier },
      { failedCount: 0, lockoutCount: 0, lockedUntil: null, lastFailedAt: null },
    );
  }

  /**
   * Removes stale lockout records outside the sliding window.
   */
  async cleanupExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - this.windowMs);
    await this.loginAttemptRepository.delete({
      lastFailedAt: LessThan(cutoff),
    });
  }
}
