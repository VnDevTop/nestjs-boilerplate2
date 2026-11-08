import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { OneTimeTokenService } from './one-time-token.service.js';
import { UsersService } from '../users/users.service.js';
import { Role } from '../../common/enums/role.enum.js';
import { AuthMethod } from '../../common/enums/auth-method.enum.js';
import { User } from '../users/entities/user.entity.js';

describe('OneTimeTokenService', () => {
  let service: OneTimeTokenService;
  let usersService: UsersService;

  const mockUser: User = {
    id: 'user-1',
    sub: 'sub-123',
    email: 'test@example.com',
    emailVerified: true,
    name: 'Test User',
    givenName: 'Test',
    familyName: 'User',
    picture: null,
    locale: 'en',
    roles: [Role.USER],
    status: 'active' as any,
    totpEnabled: false,
    loginTokenHash: 'hashed-token',
    loginTokenExpiresAt: new Date(Date.now() + 60 * 1000),
    loginTokenConsumed: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OneTimeTokenService,
        {
          provide: UsersService,
          useValue: {
            updateProfile: vi.fn(),
            findByLoginTokenHash: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OneTimeTokenService>(OneTimeTokenService);
    usersService = module.get<UsersService>(UsersService);
  });

  describe('generateToken', () => {
    it('should generate a random opaque token string', () => {
      const token = service.generateToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      // Magic link tokens are opaque base64url strings, not numeric passcodes.
      expect(token).not.toMatch(/^\d{6}$/);
    });

    it('should generate a different token on each call', () => {
      const first = service.generateToken();
      const second = service.generateToken();

      expect(first).not.toBe(second);
    });
  });

  describe('generatePasscode', () => {
    it('should generate a 6-digit numeric passcode', () => {
      expect(service.generatePasscode()).toMatch(/^\d{6}$/);
    });

    it('should generate a different passcode on each call', () => {
      const first = service.generatePasscode();
      const second = service.generatePasscode();

      expect(first).not.toBe(second);
    });
  });

  describe('hashToken', () => {
    it('should hash the token with Argon2id using the fixed salt', async () => {
      const hash = await service.hashToken('some-token');

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.startsWith('$argon2id$')).toBe(true);
    });

    it('should produce a deterministic hash for the same token', async () => {
      const hash1 = await service.hashToken('same-token');
      const hash2 = await service.hashToken('same-token');

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different tokens', async () => {
      const hash1 = await service.hashToken('token-a');
      const hash2 = await service.hashToken('token-b');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('createToken', () => {
    it('should generate and persist a hashed magic link token', async () => {
      const { token, expiresAt } = await service.createToken(
        'user-1',
        'MAGIC_LINK',
      );

      expect(token).toBeDefined();
      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 15 * 60 * 1000 + 1000,
      );
      expect(usersService.updateProfile).toHaveBeenCalledWith('user-1', {
        loginTokenHash: await service.hashToken(token),
        loginTokenExpiresAt: expiresAt,
        loginTokenConsumed: false,
      });
    });

    it('should generate a numeric passcode for passcode token type', async () => {
      const { token } = await service.createToken('user-1', 'PASSCODE');

      expect(token).toMatch(/^\d{6}$/);
      expect(usersService.updateProfile).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          loginTokenHash: await service.hashToken(token),
        }),
      );
    });
  });

  describe('verifyToken', () => {
    it('should resolve and consume a valid token', async () => {
      vi.mocked(usersService.findByLoginTokenHash).mockResolvedValue(mockUser);

      const result = await service.verifyToken('valid-token');

      expect(result.userId).toBe('user-1');
      expect(result.authMethod).toBe(AuthMethod.MAGIC_LINK);
      expect(usersService.updateProfile).toHaveBeenCalledWith('user-1', {
        loginTokenConsumed: true,
      });
    });

    it('should throw UnauthorizedException when token is unknown', async () => {
      vi.mocked(usersService.findByLoginTokenHash).mockResolvedValue(null);

      await expect(service.verifyToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      vi.mocked(usersService.findByLoginTokenHash).mockResolvedValue({
        ...mockUser,
        loginTokenExpiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.verifyToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when token is already consumed', async () => {
      vi.mocked(usersService.findByLoginTokenHash).mockResolvedValue({
        ...mockUser,
        loginTokenConsumed: true,
      });

      await expect(service.verifyToken('used-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should resolve passcode tokens to the PASSCODE auth method', async () => {
      vi.mocked(usersService.findByLoginTokenHash).mockResolvedValue(mockUser);

      const result = await service.verifyToken('123456');

      expect(result.authMethod).toBe(AuthMethod.PASSCODE);
    });
  });
});
