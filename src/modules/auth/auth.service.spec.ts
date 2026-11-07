import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { MailerService } from '@nestjs-modules/mailer';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { PasswordService } from './password.service.js';
import { TotpService } from './totp.service.js';
import { OneTimeTokenService } from './one-time-token.service.js';
import { DeviceAuthorizationService } from './device-authorization.service.js';
import { AuthMethod } from '../../common/enums/auth-method.enum.js';
import { jwtConfig } from '../../config/jwt.config.js';
import {
  DeviceAuthorizationStatus,
  DeviceAuthorization,
} from './entities/device-authorization.entity.js';
import { Role } from '../../common/enums/role.enum.js';
import { User } from '../users/entities/user.entity.js';
import type { RequestUser } from '../../common/interfaces/request-user.interface.js';

const { toDataURLMock } = vi.hoisted(() => ({
  toDataURLMock: vi.fn(async () => 'data:image/png;base64,abc'),
}));

vi.mock('qrcode', () => ({
  toDataURL: toDataURLMock,
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let passwordService: PasswordService;
  let jwtService: JwtService;
  let totpService: TotpService;
  let mailerService: MailerService;
  let oneTimeTokenService: OneTimeTokenService;
  let deviceAuthorizationService: DeviceAuthorizationService;

  const mockDevice: DeviceAuthorization = {
    id: 'device-auth-1',
    deviceCode: 'device-code-1',
    userCode: 'ABCD-EFGH',
    clientId: 'nestjs-device-client',
    userId: null,
    status: DeviceAuthorizationStatus.PENDING,
    scopes: null,
    expiresAt: new Date(Date.now() + 60 * 1000),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
  } as DeviceAuthorization;

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
    loginTokenConsumed: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    passwordHash: 'hashed-password',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: vi.fn(),
            findByEmailWithPassword: vi.fn(),
            findById: vi.fn(),
            findByIdWithTotp: vi.fn(),
            updateProfile: vi.fn(),
            create: vi.fn(),
          },
        },
        {
          provide: PasswordService,
          useValue: {
            hash: vi.fn(),
            verify: vi.fn(),
            needsRehash: vi.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: vi.fn(),
            verifyAsync: vi.fn(),
          },
        },
        {
          provide: TotpService,
          useValue: {
            generateSecret: vi.fn(),
            generateUri: vi.fn(),
            verifyTotp: vi.fn(),
            generateBackupCodes: vi.fn(),
          },
        },
        {
          provide: MailerService,
          useValue: {
            sendMail: vi.fn(),
          },
        },
        {
          provide: OneTimeTokenService,
          useValue: {
            createToken: vi.fn(),
            verifyToken: vi.fn(),
          },
        },
        {
          provide: DeviceAuthorizationService,
          useValue: {
            createAuthorization: vi.fn(),
            findByDeviceCode: vi.fn(),
            findByUserCode: vi.fn(),
            approve: vi.fn(),
            approveByUserCode: vi.fn(),
            deny: vi.fn(),
            isExpired: vi.fn(),
            cleanupExpired: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    passwordService = module.get<PasswordService>(PasswordService);
    jwtService = module.get<JwtService>(JwtService);
    totpService = module.get<TotpService>(TotpService);
    mailerService = module.get<MailerService>(MailerService);
    oneTimeTokenService = module.get<OneTimeTokenService>(OneTimeTokenService);
    deviceAuthorizationService = module.get<DeviceAuthorizationService>(
      DeviceAuthorizationService,
    );
  });

  describe('AuthService without MailerService (optional dependency)', () => {
    let serviceWithoutMailer: AuthService;
    let usersServiceWithoutMailer: UsersService;
    let oneTimeTokenServiceWithoutMailer: OneTimeTokenService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          {
            provide: UsersService,
            useValue: {
              findByEmail: vi.fn(),
              findByEmailWithPassword: vi.fn(),
              findById: vi.fn(),
              findByIdWithTotp: vi.fn(),
              updateProfile: vi.fn(),
              create: vi.fn(),
            },
          },
          {
            provide: PasswordService,
            useValue: {
              hash: vi.fn(),
              verify: vi.fn(),
              needsRehash: vi.fn(),
            },
          },
          {
            provide: JwtService,
            useValue: {
              signAsync: vi.fn(),
              verifyAsync: vi.fn(),
            },
          },
          {
            provide: TotpService,
            useValue: {
              generateSecret: vi.fn(),
              generateUri: vi.fn(),
              verifyTotp: vi.fn(),
              generateBackupCodes: vi.fn(),
            },
          },
          {
            provide: OneTimeTokenService,
            useValue: {
              createToken: vi.fn(),
              verifyToken: vi.fn(),
            },
          },
          {
            provide: DeviceAuthorizationService,
            useValue: {
              createAuthorization: vi.fn(),
              findByDeviceCode: vi.fn(),
              findByUserCode: vi.fn(),
              approve: vi.fn(),
              approveByUserCode: vi.fn(),
              deny: vi.fn(),
              isExpired: vi.fn(),
              cleanupExpired: vi.fn(),
            },
          },
        ],
      }).compile();

      serviceWithoutMailer = module.get<AuthService>(AuthService);
      usersServiceWithoutMailer = module.get<UsersService>(UsersService);
      oneTimeTokenServiceWithoutMailer =
        module.get<OneTimeTokenService>(OneTimeTokenService);
    });

    it('should still return generic success for magic link request when mailer is not configured', async () => {
      vi.mocked(usersServiceWithoutMailer.findByEmail).mockResolvedValue(
        mockUser,
      );
      vi.mocked(oneTimeTokenServiceWithoutMailer.createToken).mockResolvedValue(
        { token: 'magic-token', expiresAt: new Date() },
      );

      const result =
        await serviceWithoutMailer.requestMagicLink('test@example.com');

      expect(result).toEqual({ success: true });
      expect(oneTimeTokenServiceWithoutMailer.createToken).toHaveBeenCalledWith(
        'user-1',
        'MAGIC_LINK',
      );
    });

    it('should still return generic success for passcode request when mailer is not configured', async () => {
      vi.mocked(usersServiceWithoutMailer.findByEmail).mockResolvedValue(
        mockUser,
      );
      vi.mocked(oneTimeTokenServiceWithoutMailer.createToken).mockResolvedValue(
        { token: '123456', expiresAt: new Date() },
      );

      const result =
        await serviceWithoutMailer.requestPasscode('test@example.com');

      expect(result).toEqual({ success: true });
      expect(oneTimeTokenServiceWithoutMailer.createToken).toHaveBeenCalledWith(
        'user-1',
        'PASSCODE',
      );
    });
  });

  describe('register', () => {
    it('should register a new user and return auth result', async () => {
      vi.mocked(usersService.findByEmail).mockResolvedValue(null);
      vi.mocked(passwordService.hash).mockResolvedValue('hashed-password');
      vi.mocked(usersService.create).mockResolvedValue(mockUser);
      vi.mocked(jwtService.signAsync)
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.register(
        'test@example.com',
        'password123',
        'Test User',
      );

      expect(result.user.sub).toBe('user-1');
      expect(result.user.email).toBe('test@example.com');
      expect(result.tokens?.accessToken).toBe('access-token');
      expect(result.tokens?.refreshToken).toBe('refresh-token');
      expect(result.tokens?.tokenType).toBe('Bearer');
      expect(usersService.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        sub: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hashed-password',
        emailVerified: false,
        roles: [Role.USER],
      });
      expect(passwordService.hash).toHaveBeenCalledWith('password123');
    });

    it('should handle user with null name', async () => {
      const userWithNullName = { ...mockUser, name: null };
      vi.mocked(usersService.findByEmail).mockResolvedValue(null);
      vi.mocked(passwordService.hash).mockResolvedValue('hashed-password');
      vi.mocked(usersService.create).mockResolvedValue(userWithNullName);
      vi.mocked(jwtService.signAsync)
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.register('test@example.com', 'password123');

      expect(result.user.name).toBeUndefined();
    });

    it('should throw ConflictException if user already exists', async () => {
      vi.mocked(usersService.findByEmail).mockResolvedValue(mockUser);

      await expect(
        service.register('test@example.com', 'password123'),
      ).rejects.toThrow(ConflictException);
    });

    it('should use email as name when name not provided', async () => {
      vi.mocked(usersService.findByEmail).mockResolvedValue(null);
      vi.mocked(passwordService.hash).mockResolvedValue('hashed-password');
      vi.mocked(usersService.create).mockResolvedValue(mockUser);
      vi.mocked(jwtService.signAsync)
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      await service.register('test@example.com', 'password123');

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: null }),
      );
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      vi.mocked(usersService.findByEmailWithPassword).mockResolvedValue(
        mockUser,
      );
      vi.mocked(passwordService.verify).mockResolvedValue(true);
      vi.mocked(usersService.findByEmail).mockResolvedValue(mockUser);
      vi.mocked(jwtService.signAsync)
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.login('test@example.com', 'password123');

      expect(result.user.sub).toBe('user-1');
      expect(result.tokens?.accessToken).toBe('access-token');
      expect(result.tokens?.refreshToken).toBe('refresh-token');
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          sub: 'user-1',
          email: 'test@example.com',
          roles: [Role.USER],
        }),
        { expiresIn: '15m' },
      );
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ type: 'refresh' }),
        expect.objectContaining({ secret: jwtConfig().refreshSecret }),
      );
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      vi.mocked(usersService.findByEmailWithPassword).mockResolvedValue(null);

      await expect(
        service.login('nonexistent@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      vi.mocked(usersService.findByEmailWithPassword).mockResolvedValue(
        mockUser,
      );
      vi.mocked(passwordService.verify).mockResolvedValue(false);

      await expect(
        service.login('test@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException with generic message for invalid credentials', async () => {
      vi.mocked(usersService.findByEmailWithPassword).mockResolvedValue(
        mockUser,
      );
      vi.mocked(passwordService.verify).mockResolvedValue(false);

      await expect(
        service.login('test@example.com', 'wrong-password'),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedException when user has no password hash', async () => {
      const userWithoutPassword = { ...mockUser, passwordHash: null };
      vi.mocked(usersService.findByEmailWithPassword).mockResolvedValue(
        userWithoutPassword,
      );

      await expect(
        service.login('test@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user not found after validation', async () => {
      vi.mocked(usersService.findByEmailWithPassword).mockResolvedValue(
        mockUser,
      );
      vi.mocked(passwordService.verify).mockResolvedValue(true);
      vi.mocked(usersService.findByEmail).mockResolvedValue(null);

      await expect(
        service.login('test@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return mfaRequired and mfaToken when user has totp enabled', async () => {
      vi.mocked(usersService.findByEmailWithPassword).mockResolvedValue(
        mockUser,
      );
      vi.mocked(passwordService.verify).mockResolvedValue(true);
      vi.mocked(usersService.findByEmail).mockResolvedValue({
        ...mockUser,
        totpEnabled: true,
      });
      vi.mocked(jwtService.signAsync).mockResolvedValue('mfa-token');

      const result = await service.login('test@example.com', 'password123');

      expect(result.mfaRequired).toBe(true);
      expect(result.mfaToken).toBe('mfa-token');
      expect(result.tokens).toBeUndefined();
      expect(jwtService.signAsync).toHaveBeenCalledTimes(1);
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-1',
          email: 'test@example.com',
          type: 'mfa',
          authMethod: AuthMethod.PASSWORD,
        }),
        { expiresIn: '10m' },
      );
    });
  });

  describe('validateUser', () => {
    it('should return user for valid credentials', async () => {
      vi.mocked(usersService.findByEmailWithPassword).mockResolvedValue(
        mockUser,
      );
      vi.mocked(passwordService.verify).mockResolvedValue(true);

      const result = await service.validateUser(
        'test@example.com',
        'password123',
      );

      expect(result).not.toBeNull();
      expect(result?.sub).toBe('user-1');
      expect(result?.email).toBe('test@example.com');
    });

    it('should return null for invalid email', async () => {
      vi.mocked(usersService.findByEmailWithPassword).mockResolvedValue(null);

      const result = await service.validateUser(
        'nonexistent@example.com',
        'password123',
      );

      expect(result).toBeNull();
    });

    it('should return null for invalid password', async () => {
      vi.mocked(usersService.findByEmailWithPassword).mockResolvedValue(
        mockUser,
      );
      vi.mocked(passwordService.verify).mockResolvedValue(false);

      const result = await service.validateUser(
        'test@example.com',
        'wrong-password',
      );

      expect(result).toBeNull();
    });
  });

  describe('issueTokens', () => {
    it('should issue access and refresh tokens', async () => {
      vi.mocked(jwtService.signAsync)
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.issueTokens({
        sub: 'user-1',
        email: 'test@example.com',
        roles: [Role.USER],
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.expiresIn).toBe(900);
      expect(result.tokenType).toBe('Bearer');
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens with valid refresh token', async () => {
      vi.mocked(jwtService.verifyAsync).mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
        roles: [Role.USER],
        type: 'refresh',
      });
      vi.mocked(usersService.findById).mockResolvedValue(mockUser);
      vi.mocked(jwtService.signAsync)
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      const result = await service.refreshTokens('valid-refresh-token');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      vi.mocked(jwtService.verifyAsync).mockRejectedValue(new Error('invalid'));

      await expect(service.refreshTokens('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for non-refresh token', async () => {
      vi.mocked(jwtService.verifyAsync).mockResolvedValue({
        sub: 'user-1',
        email: 'test@example.com',
        roles: [Role.USER],
        type: 'access',
      });

      await expect(service.refreshTokens('access-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user not found', async () => {
      vi.mocked(jwtService.verifyAsync).mockResolvedValue({
        sub: 'non-existent',
        email: 'test@example.com',
        roles: [Role.USER],
        type: 'refresh',
      });
      vi.mocked(usersService.findById).mockResolvedValue(null);

      await expect(
        service.refreshTokens('valid-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyToken', () => {
    it('should verify and return decoded payload', async () => {
      const payload = { sub: 'user-1', email: 'test@example.com' };
      vi.mocked(jwtService.verifyAsync).mockResolvedValue(payload);

      const result = await service.verifyToken('valid-token');

      expect(result).toEqual(payload);
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-token');
    });
  });

  describe('verifyMfa', () => {
    it('should enable mfa when totp code is valid (setup flow)', async () => {
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue({
        ...mockUser,
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });
      vi.mocked(totpService.verifyTotp).mockResolvedValue(true);

      const result = await service.verifyMfa(
        'user-1',
        'test@example.com',
        '123456',
      );

      expect(result.enabled).toBe(true);
      expect(usersService.updateProfile).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ totpEnabled: true }),
      );
    });

    it('should return enabled false when setup totp code is invalid', async () => {
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue({
        ...mockUser,
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });
      vi.mocked(totpService.verifyTotp).mockResolvedValue(false);

      const result = await service.verifyMfa(
        'user-1',
        'test@example.com',
        '000000',
      );

      expect(result.enabled).toBe(false);
      expect(usersService.updateProfile).not.toHaveBeenCalled();
    });

    it('should return enabled false when totp secret is missing', async () => {
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue({
        ...mockUser,
        totpSecret: null,
      });

      const result = await service.verifyMfa(
        'user-1',
        'test@example.com',
        '123456',
      );

      expect(result.enabled).toBe(false);
    });

    it('should return tokens when mfa token and valid code verify', async () => {
      vi.mocked(jwtService.verifyAsync).mockResolvedValue({
        sub: 'user-1',
        type: 'mfa',
      });
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue({
        ...mockUser,
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });
      vi.mocked(totpService.verifyTotp).mockResolvedValue(true);
      vi.mocked(jwtService.signAsync)
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.verifyMfa(
        'user-1',
        'test@example.com',
        '123456',
        'mfa-token',
      );

      expect(result.enabled).toBe(true);
      expect(result.tokens?.accessToken).toBe('access-token');
      expect(result.tokens?.refreshToken).toBe('refresh-token');
    });

    it('should return enabled false when mfa token code is invalid', async () => {
      vi.mocked(jwtService.verifyAsync).mockResolvedValue({
        sub: 'user-1',
        type: 'mfa',
      });
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue({
        ...mockUser,
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });
      vi.mocked(totpService.verifyTotp).mockResolvedValue(false);

      const result = await service.verifyMfa(
        'user-1',
        'test@example.com',
        '000000',
        'mfa-token',
      );

      expect(result.enabled).toBe(false);
    });

    it('should throw UnauthorizedException when mfa token has invalid type', async () => {
      vi.mocked(jwtService.verifyAsync).mockResolvedValue({
        sub: 'user-1',
        type: 'access',
      });
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue({
        ...mockUser,
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });

      await expect(
        service.verifyMfa('user-1', 'test@example.com', '123456', 'mfa-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return enabled false when mfa token user has no secret', async () => {
      vi.mocked(jwtService.verifyAsync).mockResolvedValue({
        sub: 'user-1',
        type: 'mfa',
      });
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue({
        ...mockUser,
        totpSecret: null,
      });

      const result = await service.verifyMfa(
        'user-1',
        'test@example.com',
        '123456',
        'mfa-token',
      );

      expect(result.enabled).toBe(false);
    });

    it('should throw NotFoundException when user not found', async () => {
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue(null);

      await expect(
        service.verifyMfa('user-1', 'test@example.com', '123456'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('disableMfa', () => {
    it('should disable mfa when totp code is valid', async () => {
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue({
        ...mockUser,
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });
      vi.mocked(totpService.verifyTotp).mockResolvedValue(true);

      const result = await service.disableMfa(
        'user-1',
        'test@example.com',
        '123456',
      );

      expect(result.enabled).toBe(true);
      expect(usersService.updateProfile).toHaveBeenCalledWith('user-1', {
        totpSecret: null,
        totpEnabled: false,
        backupCodes: null,
      });
    });

    it('should return enabled false when totp code is invalid', async () => {
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue({
        ...mockUser,
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });
      vi.mocked(totpService.verifyTotp).mockResolvedValue(false);

      const result = await service.disableMfa(
        'user-1',
        'test@example.com',
        '000000',
      );

      expect(result.enabled).toBe(false);
    });

    it('should return enabled false when totp secret is missing', async () => {
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue({
        ...mockUser,
        totpSecret: null,
      });

      const result = await service.disableMfa(
        'user-1',
        'test@example.com',
        '123456',
      );

      expect(result.enabled).toBe(false);
    });

    it('should throw NotFoundException when user not found', async () => {
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue(null);

      await expect(
        service.disableMfa('user-1', 'test@example.com', '123456'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('setupMfa', () => {
    it('should set up totp and return secret, otpauth url and qr code', async () => {
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue(mockUser);
      vi.mocked(totpService.generateSecret).mockReturnValue('JBSWY3DPEHPK3PXP');
      vi.mocked(totpService.generateUri).mockReturnValue(
        'otpauth://totp/NestJS%20Boilerplate:user%40example.com?secret=JBSWY3DPEHPK3PXP',
      );
      toDataURLMock.mockResolvedValue('data:image/png;base64,abc');
      vi.mocked(usersService.updateProfile).mockResolvedValue(mockUser);

      const result = await service.setupMfa('user-1', 'test@example.com');

      expect(result).toEqual({
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl:
          'otpauth://totp/NestJS%20Boilerplate:user%40example.com?secret=JBSWY3DPEHPK3PXP',
        qrCode: 'data:image/png;base64,abc',
      });
      expect(toDataURLMock).toHaveBeenCalledWith(
        'otpauth://totp/NestJS%20Boilerplate:user%40example.com?secret=JBSWY3DPEHPK3PXP',
      );
      expect(usersService.updateProfile).toHaveBeenCalledWith('user-1', {
        totpSecret: 'JBSWY3DPEHPK3PXP',
        totpEnabled: false,
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue(null);

      await expect(
        service.setupMfa('user-1', 'test@example.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyMfaWithToken', () => {
    it('should throw UnauthorizedException when the mfa token is invalid', async () => {
      vi.mocked(jwtService.verifyAsync).mockRejectedValue(
        new Error('jwt malformed'),
      );
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue({
        ...mockUser,
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });

      await expect(
        service.verifyMfaWithToken('mfa-token', '123456'),
      ).rejects.toThrow(UnauthorizedException);
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('mfa-token', {
        secret: jwtConfig().secret,
      });
    });

    it('should return tokens when mfa token and valid code verify', async () => {
      vi.mocked(jwtService.verifyAsync).mockResolvedValue({
        sub: 'user-1',
        type: 'mfa',
      });
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue({
        ...mockUser,
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });
      vi.mocked(totpService.verifyTotp).mockResolvedValue(true);
      vi.mocked(jwtService.signAsync)
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.verifyMfaWithToken('mfa-token', '123456');

      expect(result.enabled).toBe(true);
      expect(result.tokens?.accessToken).toBe('access-token');
      expect(result.tokens?.refreshToken).toBe('refresh-token');
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          authMethod: AuthMethod.PASSWORD,
          mfaVerified: true,
        }),
        expect.anything(),
      );
    });

    it('should return enabled false when the mfa code is invalid during login', async () => {
      vi.mocked(jwtService.verifyAsync).mockResolvedValue({
        sub: 'user-1',
        type: 'mfa',
      });
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue({
        ...mockUser,
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });
      vi.mocked(totpService.verifyTotp).mockResolvedValue(false);

      const result = await service.verifyMfaWithToken('mfa-token', '000000');

      expect(result.enabled).toBe(false);
      expect(result.tokens).toBeUndefined();
    });

    it('should throw UnauthorizedException when the mfa token has an invalid type', async () => {
      vi.mocked(jwtService.verifyAsync).mockResolvedValue({
        sub: 'user-1',
        type: 'access',
      });

      await expect(
        service.verifyMfaWithToken('mfa-token', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw NotFoundException when user not found', async () => {
      vi.mocked(jwtService.verifyAsync).mockResolvedValue({
        sub: 'user-1',
        type: 'mfa',
      });
      vi.mocked(usersService.findByIdWithTotp).mockResolvedValue(null);

      await expect(
        service.verifyMfaWithToken('mfa-token', '123456'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('requestMagicLink', () => {
    it('should send magic link email when user exists and return generic success', async () => {
      vi.mocked(usersService.findByEmail).mockResolvedValue(mockUser);
      vi.mocked(oneTimeTokenService.createToken).mockResolvedValue({
        token: 'magic-token',
        expiresAt: new Date(),
      });

      const result = await service.requestMagicLink('test@example.com');

      expect(result).toEqual({ success: true });
      expect(oneTimeTokenService.createToken).toHaveBeenCalledWith(
        'user-1',
        'MAGIC_LINK',
      );
      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'test@example.com' }),
      );
    });

    it('should return generic success when user does not exist', async () => {
      vi.mocked(usersService.findByEmail).mockResolvedValue(null);

      const result = await service.requestMagicLink('unknown@example.com');

      expect(result).toEqual({ success: true });
      expect(oneTimeTokenService.createToken).not.toHaveBeenCalled();
      expect(mailerService.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('verifyMagicLink', () => {
    it('should issue tokens when magic link is valid and user has no totp', async () => {
      vi.mocked(oneTimeTokenService.verifyToken).mockResolvedValue({
        userId: 'user-1',
        authMethod: AuthMethod.MAGIC_LINK,
      });
      vi.mocked(usersService.findById).mockResolvedValue(mockUser);
      vi.mocked(jwtService.signAsync)
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.verifyMagicLink('magic-token');

      expect(result.tokens?.accessToken).toBe('access-token');
      expect(result.tokens?.refreshToken).toBe('refresh-token');
      expect(result.user.sub).toBe('user-1');
    });

    it('should return mfaRequired and mfaToken when user has totp enabled', async () => {
      vi.mocked(oneTimeTokenService.verifyToken).mockResolvedValue({
        userId: 'user-1',
        authMethod: AuthMethod.MAGIC_LINK,
      });
      vi.mocked(usersService.findById).mockResolvedValue({
        ...mockUser,
        totpEnabled: true,
      });
      vi.mocked(jwtService.signAsync).mockResolvedValue('mfa-token');

      const result = await service.verifyMagicLink('magic-token');

      expect(result.mfaRequired).toBe(true);
      expect(result.mfaToken).toBe('mfa-token');
    });

    it('should throw UnauthorizedException when user not found after valid token', async () => {
      vi.mocked(oneTimeTokenService.verifyToken).mockResolvedValue({
        userId: 'user-1',
        authMethod: AuthMethod.MAGIC_LINK,
      });
      vi.mocked(usersService.findById).mockResolvedValue(null);

      await expect(service.verifyMagicLink('magic-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('requestPasscode', () => {
    it('should send passcode email when user exists and return generic success', async () => {
      vi.mocked(usersService.findByEmail).mockResolvedValue(mockUser);
      vi.mocked(oneTimeTokenService.createToken).mockResolvedValue({
        token: '123456',
        expiresAt: new Date(),
      });

      const result = await service.requestPasscode('test@example.com');

      expect(result).toEqual({ success: true });
      expect(oneTimeTokenService.createToken).toHaveBeenCalledWith(
        'user-1',
        'PASSCODE',
      );
      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'test@example.com' }),
      );
    });

    it('should return generic success when user does not exist', async () => {
      vi.mocked(usersService.findByEmail).mockResolvedValue(null);

      const result = await service.requestPasscode('unknown@example.com');

      expect(result).toEqual({ success: true });
      expect(mailerService.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('verifyPasscode', () => {
    it('should issue tokens when passcode is valid and user has no totp', async () => {
      vi.mocked(oneTimeTokenService.verifyToken).mockResolvedValue({
        userId: 'user-1',
        authMethod: AuthMethod.PASSCODE,
      });
      vi.mocked(usersService.findById).mockResolvedValue(mockUser);
      vi.mocked(jwtService.signAsync)
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.verifyPasscode('123456');

      expect(result.tokens?.accessToken).toBe('access-token');
      expect(result.tokens?.refreshToken).toBe('refresh-token');
      expect(oneTimeTokenService.verifyToken).toHaveBeenCalledWith('123456');
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          authMethod: AuthMethod.PASSCODE,
          mfaVerified: true,
        }),
        expect.anything(),
      );
    });

    it('should return mfaRequired and mfaToken when user has totp enabled', async () => {
      vi.mocked(oneTimeTokenService.verifyToken).mockResolvedValue({
        userId: 'user-1',
        authMethod: AuthMethod.PASSCODE,
      });
      vi.mocked(usersService.findById).mockResolvedValue({
        ...mockUser,
        totpEnabled: true,
      });
      vi.mocked(jwtService.signAsync).mockResolvedValue('mfa-token');

      const result = await service.verifyPasscode('123456');

      expect(result.mfaRequired).toBe(true);
      expect(result.mfaToken).toBe('mfa-token');
    });

    it('should throw UnauthorizedException when user not found after valid token', async () => {
      vi.mocked(oneTimeTokenService.verifyToken).mockResolvedValue({
        userId: 'user-1',
        authMethod: AuthMethod.MAGIC_LINK,
      });
      vi.mocked(usersService.findById).mockResolvedValue(null);

      await expect(service.verifyPasscode('123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('requestDeviceCode', () => {
    it('should create a device authorization and return the response', async () => {
      vi.mocked(
        deviceAuthorizationService.createAuthorization,
      ).mockResolvedValue(mockDevice);

      const result = await service.requestDeviceCode('nestjs-device-client', [
        'openid',
      ]);

      expect(
        deviceAuthorizationService.createAuthorization,
      ).toHaveBeenCalledWith('nestjs-device-client', ['openid']);
      expect(result.deviceCode).toBe('device-code-1');
      expect(result.userCode).toBe('ABCD-EFGH');
      expect(result.verificationUri).toBe(
        'http://localhost:3000/auth/device/verify?user_code=ABCD-EFGH',
      );
      expect(result.verificationUriComplete).toBe(
        'http://localhost:3000/auth/device/verify?user_code=ABCD-EFGH&client_id=nestjs-device-client',
      );
      expect(result.expiresIn).toBeGreaterThan(0);
      expect(result.interval).toBe(5);
    });
  });

  describe('approveDevice', () => {
    it('should throw UnauthorizedException when mfa is not verified', async () => {
      const user = { sub: 'user-1' } as RequestUser;

      await expect(service.approveDevice('ABCD-EFGH', user)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(deviceAuthorizationService.findByUserCode).not.toHaveBeenCalled();
    });

    it('should approve a pending device when mfa is verified', async () => {
      vi.mocked(deviceAuthorizationService.findByUserCode).mockResolvedValue(
        mockDevice,
      );
      vi.mocked(deviceAuthorizationService.approveByUserCode).mockResolvedValue(
        {
          ...mockDevice,
          status: DeviceAuthorizationStatus.APPROVED,
          userId: 'user-1',
        },
      );

      const result = await service.approveDevice('ABCD-EFGH', {
        sub: 'user-1',
        mfaVerified: true,
      } as RequestUser);

      expect(deviceAuthorizationService.approveByUserCode).toHaveBeenCalledWith(
        'ABCD-EFGH',
        'user-1',
      );
      expect(result.status).toBe(DeviceAuthorizationStatus.APPROVED);
    });

    it('should throw UnauthorizedException when the device is not pending', async () => {
      vi.mocked(deviceAuthorizationService.findByUserCode).mockResolvedValue({
        ...mockDevice,
        status: DeviceAuthorizationStatus.APPROVED,
      });

      await expect(
        service.approveDevice('ABCD-EFGH', {
          sub: 'user-1',
          mfaVerified: true,
        } as RequestUser),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when the device authorization is unknown', async () => {
      vi.mocked(deviceAuthorizationService.findByUserCode).mockResolvedValue(
        null,
      );

      await expect(
        service.approveDevice('ABCD-EFGH', {
          sub: 'user-1',
          mfaVerified: true,
        } as RequestUser),
      ).rejects.toThrow(UnauthorizedException);
      expect(
        deviceAuthorizationService.approveByUserCode,
      ).not.toHaveBeenCalled();
    });
  });

  describe('pollDevice', () => {
    it('should throw UnauthorizedException when the device code is unknown', async () => {
      vi.mocked(deviceAuthorizationService.findByDeviceCode).mockResolvedValue(
        null,
      );

      await expect(service.pollDevice('unknown-code')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return pending status when the device is pending', async () => {
      vi.mocked(deviceAuthorizationService.findByDeviceCode).mockResolvedValue(
        mockDevice,
      );

      const result = await service.pollDevice('device-code-1');

      expect(result.status).toBe(DeviceAuthorizationStatus.PENDING);
    });

    it('should return denied status when the device is denied', async () => {
      vi.mocked(deviceAuthorizationService.findByDeviceCode).mockResolvedValue({
        ...mockDevice,
        status: DeviceAuthorizationStatus.DENIED,
      });

      const result = await service.pollDevice('device-code-1');

      expect(result.status).toBe(DeviceAuthorizationStatus.DENIED);
    });

    it('should return expired status when the device is expired', async () => {
      vi.mocked(deviceAuthorizationService.findByDeviceCode).mockResolvedValue({
        ...mockDevice,
        status: DeviceAuthorizationStatus.EXPIRED,
      });

      const result = await service.pollDevice('device-code-1');

      expect(result.status).toBe(DeviceAuthorizationStatus.EXPIRED);
    });

    it('should issue tokens when the device is approved', async () => {
      vi.mocked(deviceAuthorizationService.findByDeviceCode).mockResolvedValue({
        ...mockDevice,
        status: DeviceAuthorizationStatus.APPROVED,
        userId: 'user-1',
      });
      vi.mocked(usersService.findById).mockResolvedValue(mockUser);
      vi.mocked(jwtService.signAsync).mockResolvedValue('issued-token');

      const result = await service.pollDevice('device-code-1');

      expect(result.status).toBe(DeviceAuthorizationStatus.APPROVED);
      expect(result.tokens?.accessToken).toBe('issued-token');
      expect(result.tokens?.refreshToken).toBe('issued-token');
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
    });

    it('should throw UnauthorizedException when the approved device user is not found', async () => {
      vi.mocked(deviceAuthorizationService.findByDeviceCode).mockResolvedValue({
        ...mockDevice,
        status: DeviceAuthorizationStatus.APPROVED,
        userId: 'unknown-user',
      });
      vi.mocked(usersService.findById).mockResolvedValue(null);

      await expect(service.pollDevice('device-code-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
