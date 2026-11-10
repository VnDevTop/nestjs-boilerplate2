import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { BruteForceProtectionService } from './brute-force-protection.service.js';
import { LoginAttempt } from './entities/login-attempt.entity.js';
import { BruteForceProtectionOptions } from '../../config/brute-force.config.js';

describe('BruteForceProtectionService', () => {
  let service: BruteForceProtectionService;
  let loginAttemptRepository: Repository<LoginAttempt>;

  const baseConfig: BruteForceProtectionOptions = {
    maxAttempts: 5,
    windowSeconds: 900,
    lockoutSeconds: 900,
    maxLockoutSeconds: 86400,
  };

  const makeAttempt = (overrides: Partial<LoginAttempt> = {}): LoginAttempt =>
    ({
      id: 'attempt-1',
      identifier: 'user@example.com',
      failedCount: 0,
      lockedUntil: null,
      lastFailedAt: null,
      lockoutCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    }) as LoginAttempt;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BruteForceProtectionService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue(baseConfig),
          },
        },
        {
          provide: getRepositoryToken(LoginAttempt),
          useValue: {
            findOne: vi.fn(),
            create: vi.fn(),
            save: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BruteForceProtectionService>(BruteForceProtectionService);
    loginAttemptRepository = module.get<Repository<LoginAttempt>>(
      getRepositoryToken(LoginAttempt),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isLocked', () => {
    it('should return false when no attempt record exists', async () => {
      vi.mocked(loginAttemptRepository.findOne).mockResolvedValue(null);

      await expect(service.isLocked('user@example.com')).resolves.toBe(false);
    });

    it('should return false when the account is not locked', async () => {
      vi.mocked(loginAttemptRepository.findOne).mockResolvedValue(
        makeAttempt({ lockedUntil: null }),
      );

      await expect(service.isLocked('user@example.com')).resolves.toBe(false);
    });

    it('should return true when the lock is still active', async () => {
      vi.mocked(loginAttemptRepository.findOne).mockResolvedValue(
        makeAttempt({ lockedUntil: new Date(Date.now() + 60_000) }),
      );

      await expect(service.isLocked('user@example.com')).resolves.toBe(true);
    });

    it('should reset and return false when the lock has expired', async () => {
      vi.mocked(loginAttemptRepository.findOne).mockResolvedValue(
        makeAttempt({ lockedUntil: new Date(Date.now() - 60_000) }),
      );
      vi.mocked(loginAttemptRepository.update).mockResolvedValue({ affected: 1 } as any);

      await expect(service.isLocked('user@example.com')).resolves.toBe(false);
      expect(loginAttemptRepository.update).toHaveBeenCalled();
    });
  });

  describe('registerFailedAttempt', () => {
    it('should create a new failure record and increment below the threshold without locking', async () => {
      vi.mocked(loginAttemptRepository.findOne).mockResolvedValue(null);
      vi.mocked(loginAttemptRepository.create).mockReturnValue(
        makeAttempt({ failedCount: 0, lockoutCount: 0 }) as any,
      );
      vi.mocked(loginAttemptRepository.save).mockResolvedValue(
        makeAttempt({ failedCount: 1 }) as any,
      );

      const result = await service.registerFailedAttempt('user@example.com');

      expect(result.failedCount).toBe(1);
      expect(result.lockedUntil).toBeNull();
      expect(loginAttemptRepository.save).toHaveBeenCalled();
    });

    it('should reset counters when the last failure is older than the window', async () => {
      vi.mocked(loginAttemptRepository.findOne).mockResolvedValue(
        makeAttempt({
          failedCount: 5,
          lockoutCount: 1,
          lockedUntil: new Date(Date.now() + 900_000),
          lastFailedAt: new Date(Date.now() - 3_600_000),
        }),
      );
      vi.mocked(loginAttemptRepository.save).mockResolvedValue(
        makeAttempt({ failedCount: 1 }) as any,
      );

      const result = await service.registerFailedAttempt('user@example.com');

      expect(result.failedCount).toBe(1);
      expect(result.lockedUntil).toBeNull();
      expect(loginAttemptRepository.save).toHaveBeenCalled();
    });

    it('should lock the account when the failed count reaches the threshold', async () => {
      vi.mocked(loginAttemptRepository.findOne).mockResolvedValue(
        makeAttempt({ failedCount: 4, lastFailedAt: new Date() }),
      );
      vi.mocked(loginAttemptRepository.save).mockResolvedValue(
        makeAttempt({
          failedCount: 0,
          lockedUntil: new Date(Date.now() + 900_000),
          lockoutCount: 1,
        }),
      );

      const result = await service.registerFailedAttempt('user@example.com');

      expect(result.lockedUntil).toBeInstanceOf(Date);
      expect(loginAttemptRepository.save).toHaveBeenCalled();
    });
  });

  describe('resetFailedAttempts', () => {
    it('should reset the failure counter and lock state', async () => {
      vi.mocked(loginAttemptRepository.update).mockResolvedValue({ affected: 1 } as any);

      await service.resetFailedAttempts('user@example.com');

      expect(loginAttemptRepository.update).toHaveBeenCalledWith(
        { identifier: 'user@example.com' },
        expect.objectContaining({ failedCount: 0 }),
      );
    });
  });

  describe('cleanupExpired', () => {
    it('should delete stale failure records outside the window', async () => {
      vi.mocked(loginAttemptRepository.delete).mockResolvedValue(undefined as any);

      await service.cleanupExpired();

      expect(loginAttemptRepository.delete).toHaveBeenCalled();
    });
  });
});
