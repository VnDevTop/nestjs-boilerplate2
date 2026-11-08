import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { RefreshTokenService } from './refresh-token.service.js';
import { RefreshToken } from './entities/refresh-token.entity.js';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let refreshTokenRepository: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  const mockRefreshToken = {
    id: 'refresh-token-1',
    tokenHash: 'hashed-refresh-token',
    userId: 'user-1',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revoked: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
  } as RefreshToken;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: {
            create: vi.fn(),
            save: vi.fn(),
            findOne: vi.fn(),
            update: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RefreshTokenService>(RefreshTokenService);
    refreshTokenRepository = module.get(
      getRepositoryToken(RefreshToken),
    ) as any;
  });

  describe('hashToken', () => {
    it('should return a deterministic argon2 hash for the same token', async () => {
      const hash1 = await service.hashToken('refresh-token');
      const hash2 = await service.hashToken('refresh-token');

      expect(typeof hash1).toBe('string');
      expect(hash1).toBe(hash2);
    });
  });

  describe('create', () => {
    it('should persist a new refresh token with hash, expiry and not revoked', async () => {
      vi.mocked(refreshTokenRepository.create).mockReturnValue(mockRefreshToken);
      vi.mocked(refreshTokenRepository.save).mockResolvedValue(mockRefreshToken);

      const result = await service.create('user-1', 'refresh-token');

      expect(refreshTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          tokenHash: expect.any(String),
          revoked: false,
          expiresAt: expect.any(Date),
        }),
      );
      expect(refreshTokenRepository.save).toHaveBeenCalled();
      expect(result).toEqual(mockRefreshToken);
    });
  });

  describe('findByTokenHash', () => {
    it('should return the refresh token when it is found', async () => {
      vi.mocked(refreshTokenRepository.findOne).mockResolvedValue(mockRefreshToken);

      const result = await service.findByTokenHash('hashed-refresh-token');

      expect(result).toEqual(mockRefreshToken);
      expect(refreshTokenRepository.findOne).toHaveBeenCalledWith({
        where: { tokenHash: 'hashed-refresh-token' },
      });
    });

    it('should return null when the refresh token is unknown', async () => {
      vi.mocked(refreshTokenRepository.findOne).mockResolvedValue(null);

      const result = await service.findByTokenHash('unknown-hash');

      expect(result).toBeNull();
    });
  });

  describe('revoke', () => {
    it('should mark the refresh token as revoked', async () => {
      vi.mocked(refreshTokenRepository.update).mockResolvedValue({ affected: 1 } as any);

      await service.revoke('hashed-refresh-token');

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { tokenHash: 'hashed-refresh-token', revoked: false },
        { revoked: true },
      );
    });
  });

  describe('revokeAllForUser', () => {
    it('should revoke all active refresh tokens of a user', async () => {
      vi.mocked(refreshTokenRepository.update).mockResolvedValue({ affected: 2 } as any);

      await service.revokeAllForUser('user-1');

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { userId: 'user-1', revoked: false },
        { revoked: true },
      );
    });
  });
});
