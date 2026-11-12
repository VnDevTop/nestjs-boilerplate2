import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { toDataURL } from 'qrcode';
import { MailerService } from '@nestjs-modules/mailer';
import { TotpService } from './totp.service.js';
import { OneTimeTokenService } from './one-time-token.service.js';
import { randomUUID } from 'node:crypto';

import { UsersService } from '../users/users.service.js';
import { PasswordService } from './password.service.js';
import { jwtConfig } from '../../config/jwt.config.js';
import { AuthResult } from '../../common/interfaces/auth-result.interface.js';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';
import { TokenPair } from '../../common/interfaces/token-pair.interface.js';
import { RequestUser } from '../../common/interfaces/request-user.interface.js';
import { AuthMethod } from '../../common/enums/auth-method.enum.js';
import { DeviceAuthorizationStatus } from './entities/device-authorization.entity.js';
import { DeviceAuthorizationService } from './device-authorization.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { BruteForceProtectionService } from './brute-force-protection.service.js';
import { DeviceAuthorizationResponse, DevicePollResponse } from './device-authorization.service.js';
import { Role } from '../../common/enums/role.enum.js';
import { User } from '../users/entities/user.entity.js';

/**
 * Authentication service.
 *
 * Handles user registration, login, token issuance, and profile
 * synchronization. Delegates user persistence to `UsersService`.
 *
 * @class AuthService
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly totpService: TotpService,
    private readonly oneTimeTokenService: OneTimeTokenService,
    private readonly deviceAuthorizationService: DeviceAuthorizationService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly bruteForceProtectionService: BruteForceProtectionService,
    @Optional() private readonly mailerService: MailerService,
  ) {}

  /**
   * Issues a JWT access token and refresh token pair.
   *
   * Access tokens are short-lived (15m by default) and used for API
   * authentication. Refresh tokens are long-lived (7d by default) and
   * used to obtain new access tokens without re-authenticating.
   *
   * @param payload - JWT payload.
   * @returns Token pair with access and refresh tokens.
   */
  async issueTokens(payload: JwtPayload): Promise<TokenPair> {
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
    });
    const refreshToken = await this.jwtService.signAsync(
      { ...payload, type: 'refresh', jti: randomUUID() },
      { secret: jwtConfig().refreshSecret, expiresIn: jwtConfig().refreshExpiresIn as any },
    );
    // Persist refresh token hash for rotation and revocation.
    await this.refreshTokenService.create(payload.sub, refreshToken);
    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
      tokenType: 'Bearer',
    };
  }

  /**
   * Issues a short-lived MFA challenge token for users with TOTP enabled.
   *
   * @param user - User entity.
   * @param authMethod - Authentication method that triggered the MFA challenge.
   * @returns Signed MFA challenge token.
   */
  async issueMfaToken(user: User, authMethod: AuthMethod = AuthMethod.PASSWORD): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles as any,
        type: 'mfa',
        authMethod,
      },
      { expiresIn: '10m' },
    );
  }

  /**
   * Refreshes an access token using a valid refresh token.
   *
   * Implements refresh token rotation: the presented refresh token is
   * verified, checked against the persisted store and then consumed
   * (revoked) before a new token pair is issued. When a reused (already
   * revoked) refresh token is detected, all refresh tokens of the user are
   * revoked (theft response) and the request is rejected.
   *
   * @param refreshToken - The refresh token string.
   * @returns New token pair.
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: jwtConfig().refreshSecret,
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const tokenHash = await this.refreshTokenService.hashToken(refreshToken);
      const stored = await this.refreshTokenService.findByTokenHash(tokenHash);
      if (!stored) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      if (stored.revoked) {
        // Reuse detected: revoke all user tokens and reject.
        await this.refreshTokenService.revokeAllForUser(user.id);
        throw new UnauthorizedException('Refresh token reuse detected');
      }

      if (stored.expiresAt && stored.expiresAt.getTime() < Date.now()) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // Rotate: consume the presented refresh token and issue a new pair.
      await this.refreshTokenService.revoke(stored.tokenHash);

      return this.issueTokens({
        sub: user.id,
        email: user.email,
        roles: user.roles as any,
        authMethod: payload.authMethod,
        mfaVerified: payload.mfaVerified,
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Validates a user by email and password.
   *
   * @param email - User email.
   * @param password - Plain-text password.
   * @returns The validated user or null.
   */
  async validateUser(email: string, password: string): Promise<RequestUser | null> {
    this.logger.log(`Validating user: ${email}`);

    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user || !user.passwordHash) {
      return null;
    }

    const isPasswordValid = await this.passwordService.verify(user.passwordHash, password);
    if (!isPasswordValid) {
      return null;
    }

    return this.toRequestUser(user);
  }

  /**
   * Registers a new user with email and password.
   *
   * @param email - User email.
   * @param password - Plain-text password.
   * @param name - Optional display name.
   * @returns Authentication result with tokens.
   */
  async register(email: string, password: string, name?: string): Promise<AuthResult> {
    this.logger.log(`Registering user: ${email}`);

    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await this.passwordService.hash(password);

    const user = await this.usersService.create({
      email,
      sub: email,
      name: name ?? null,
      passwordHash,
      emailVerified: false,
      roles: [Role.USER],
    });

    const requestUser = this.toRequestUser(user);
    const tokens = await this.issueTokens({
      sub: user.id,
      email: user.email,
      roles: user.roles as Role[],
    });

    return { user: requestUser, tokens };
  }

  /**
   * Authenticates a user with email and password.
   *
   * Applies brute-force protection: rejects locked accounts with
   * `429 Too Many Requests` and records failed attempts (locking the account
   * after the configured threshold).
   *
   * @param email - User email.
   * @param password - Plain-text password.
   * @returns Authentication result with tokens.
   */
  async login(email: string, password: string): Promise<AuthResult> {
    this.logger.log(`Login attempt: ${email}`);

    const isLocked = await this.bruteForceProtectionService.isLocked(email);
    if (isLocked) {
      throw new HttpException(
        'Too many failed login attempts. Account temporarily locked. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const requestUser = await this.validateUser(email, password);
    if (!requestUser) {
      // Failed attempt recorded for brute-force protection / account lockout.
      await this.bruteForceProtectionService.registerFailedAttempt(email);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Successful login resets the failed attempt counter.
    await this.bruteForceProtectionService.resetFailedAttempts(email);

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.totpEnabled) {
      const mfaToken = await this.issueMfaToken(user);
      return { user: requestUser, mfaRequired: true, mfaToken };
    }

    const tokens = await this.issueTokens({
      sub: user.id,
      email: user.email,
      roles: user.roles as Role[],
    });

    return { user: requestUser, tokens };
  }

  /**
   * Sets up TOTP for an authenticated user and returns the provisioning URI and QR code.
   *
   * @param userId - User ID (internal identifier).
   * @param email - User email used as the TOTP label.
   * @returns The TOTP secret, otpauth URI and QR code.
   */
  async setupMfa(userId: string, email: string): Promise<{ secret: string; otpauthUrl: string; qrCode: string }> {
    const user = await this.usersService.findByIdWithTotp(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const secret = this.totpService.generateSecret();
    const otpauthUrl = this.totpService.generateUri(secret, email);

    await this.usersService.updateProfile(userId, { totpSecret: secret, totpEnabled: false });

    const qrCode = await toDataURL(otpauthUrl);

    return { secret, otpauthUrl, qrCode };
  }

  /**
   * Verifies a TOTP code and enables two-factor authentication if valid.
   *
   * @param userId - User ID (internal identifier).
   * @param email - User email used as the TOTP label.
   * @param code - The user submitted TOTP code.
   * @returns True when MFA was enabled, false otherwise.
   */
  async verifyMfa(
    userId: string,
    email: string,
    code: string,
    mfaToken?: string,
  ): Promise<{ enabled: boolean; tokens?: TokenPair }> {
    const user = await this.usersService.findByIdWithTotp(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (mfaToken) {
      return this.verifyMfaWithToken(mfaToken, code);
    }

    const secret = user.totpSecret;
    if (!secret) {
      return { enabled: false };
    }

    const valid = await this.totpService.verifyTotp(code, secret);
    if (!valid) {
      return { enabled: false };
    }

    await this.usersService.updateProfile(userId, {
      totpSecret: secret,
      totpEnabled: true,
      backupCodes: this.totpService.generateBackupCodes(),
    });

    return { enabled: true };
  }

  /**
   * Verifies the MFA challenge token issued during login and exchanges it
   * for a fully authenticated token pair.
   *
   * @param mfaToken - Pending MFA challenge token issued at login.
   * @param code - The user submitted TOTP code.
   * @returns MFA status and, when verified, the issued token pair.
   */
  async verifyMfaWithToken(mfaToken: string, code: string): Promise<{ enabled: boolean; tokens?: TokenPair }> {
    const payload = await this.jwtService
      .verifyAsync(mfaToken, { secret: jwtConfig().secret })
      .catch(() => {
        throw new UnauthorizedException('Invalid MFA token');
      });
    if (payload.type !== 'mfa') {
      throw new UnauthorizedException('Invalid MFA token');
    }

    const user = await this.usersService.findByIdWithTotp(payload.sub);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const secret = user.totpSecret;
    if (!secret) {
      return { enabled: false };
    }

    const valid = await this.totpService.verifyTotp(code, secret);
    if (!valid) {
      return { enabled: false };
    }

    const tokens = await this.issueTokens({
      sub: user.id,
      email: user.email,
      roles: user.roles as any,
      authMethod: payload.authMethod ?? AuthMethod.PASSWORD,
      mfaVerified: true,
    });

    return { enabled: true, tokens };
  }

  /**
   * Disables two-factor authentication after verifying a valid TOTP code.
   *
   * @param userId - User ID (internal identifier).
   * @param email - User email used as the TOTP label.
   * @param code - The user submitted TOTP code.
   * @returns True when MFA was disabled, false otherwise.
   */
  async disableMfa(userId: string, email: string, code: string): Promise<{ enabled: boolean }> {
    const user = await this.usersService.findByIdWithTotp(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const secret = user.totpSecret;
    if (!secret) {
      return { enabled: false };
    }

    const valid = await this.totpService.verifyTotp(code, secret);
    if (!valid) {
      return { enabled: false };
    }

    await this.usersService.updateProfile(userId, {
      totpSecret: null,
      totpEnabled: false,
      backupCodes: null,
    });

    return { enabled: true };
  }

  /**
   * Requests a device authorization for the given OAuth2 client.
   *
   * Creates a pending device authorization (device code + user code) with a
   * TTL and returns the RFC 8628 style response contract for the device.
   *
   * @param clientId - OAuth2 client identifier.
   * @param scopes - Optional requested scopes.
   * @returns Device authorization response with device/user codes and URIs.
   */
  async requestDeviceCode(clientId: string, scopes?: string[]): Promise<DeviceAuthorizationResponse> {
    const deviceAuthorization = await this.deviceAuthorizationService.createAuthorization(clientId, scopes);

    const verificationUri = `${this.getAppUrl()}/auth/device/verify?user_code=${deviceAuthorization.userCode}`;
    const verificationUriComplete = `${this.getAppUrl()}/auth/device/verify?user_code=${deviceAuthorization.userCode}&client_id=${encodeURIComponent(clientId)}`;

    return {
      deviceCode: deviceAuthorization.deviceCode,
      userCode: deviceAuthorization.userCode,
      verificationUri,
      verificationUriComplete,
      expiresIn: Math.max(0, Math.floor((deviceAuthorization.expiresAt.getTime() - Date.now()) / 1000)),
      interval: 5,
    };
  }

  /**
   * Approves a pending device authorization on behalf of an authenticated user.
   *
   * Multi-factor authentication is enforced: only users with an MFA-verified
   * JWT may approve a device (Telegram-like security posture).
   *
   * @param userCode - User-facing device code.
   * @param user - Authenticated user approving the device.
   * @returns The approved device authorization status.
   * @throws UnauthorizedException when MFA is not verified or the device is not pending.
   */
  async approveDevice(userCode: string, user: RequestUser): Promise<{ status: DeviceAuthorizationStatus }> {
    if (!user.mfaVerified) {
      throw new UnauthorizedException('Multi-factor authentication is required to approve a device');
    }

    const deviceAuthorization = await this.deviceAuthorizationService.findByUserCode(userCode);
    if (!deviceAuthorization || deviceAuthorization.status !== DeviceAuthorizationStatus.PENDING) {
      throw new UnauthorizedException('Invalid device code');
    }

    const approved = await this.deviceAuthorizationService.approveByUserCode(userCode, user.sub);
    return { status: approved.status };
  }

  /**
   * Polls the device authorization and issues tokens once approved.
   *
   * @param deviceCode - Opaque device code.
   * @returns The device poll response with token pair when approved.
   * @throws UnauthorizedException when the device code is unknown.
   */
  async pollDevice(deviceCode: string): Promise<DevicePollResponse> {
    const deviceAuthorization = await this.deviceAuthorizationService.findByDeviceCode(deviceCode);
    if (!deviceAuthorization) {
      throw new UnauthorizedException('Invalid device code');
    }

    if (deviceAuthorization.status === DeviceAuthorizationStatus.APPROVED) {
      const user = await this.usersService.findById(deviceAuthorization.userId ?? '');
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const tokens = await this.issueTokens({
        sub: user.id,
        email: user.email,
        roles: user.roles as any,
        authMethod: AuthMethod.DEVICE,
        mfaVerified: true,
      });

      return { status: DeviceAuthorizationStatus.APPROVED, tokens };
    }

    if (deviceAuthorization.status === DeviceAuthorizationStatus.DENIED) {
      return { status: DeviceAuthorizationStatus.DENIED };
    }

    if (deviceAuthorization.status === DeviceAuthorizationStatus.EXPIRED) {
      return { status: DeviceAuthorizationStatus.EXPIRED };
    }

    return { status: DeviceAuthorizationStatus.PENDING };
  }

  /**
   * Requests a magic link login token for the given email address.
   *
   * Generates a one-time token, stores its hash with an expiry and delivers
   * the link to the user by email. Always responds with a generic success
   * payload so the endpoint cannot be used to enumerate registered emails.
   *
   * @param email - User email address.
   * @returns Generic success response.
   */
  async requestMagicLink(email: string): Promise<{ success: boolean }> {
    this.logger.log(`Magic link request: ${email}`);

    const user = await this.usersService.findByEmail(email);
    if (user) {
      const { token } = await this.oneTimeTokenService.createToken(user.id, 'MAGIC_LINK');
      const verifyUrl = `${this.getAppUrl()}/auth/magic-link/verify?token=${token}`;
      if (this.mailerService) {
        await this.mailerService.sendMail({
          to: user.email,
          subject: 'Your login link',
          html: `<p>Use the following link to sign in:</p><p><a href="${verifyUrl}">Sign in</a></p>`,
          text: verifyUrl,
        });
      }
    }

    return { success: true };
  }

  /**
   * Verifies a magic link token and completes the login flow.
   *
   * @param token - The magic link token issued by email.
   * @returns Authentication result with tokens, or an MFA challenge.
   */
  async verifyMagicLink(token: string): Promise<AuthResult> {
    const { userId, authMethod } = await this.oneTimeTokenService.verifyToken(token);
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.completeLogin(user, authMethod);
  }

  /**
   * Completes a login for a user authenticated through a passwordless
   * (magic link / passcode) flow by issuing tokens or an MFA challenge.
   *
   * @param user - The user to authenticate.
   * @param authMethod - Authentication method that granted access.
   * @returns Authentication result with tokens or MFA challenge.
   */
  private async completeLogin(user: User, authMethod: AuthMethod): Promise<AuthResult> {
    if (user.totpEnabled) {
      const mfaToken = await this.issueMfaToken(user, authMethod);
      return { user: this.toRequestUser(user), mfaRequired: true, mfaToken };
    }

    const tokens = await this.issueTokens({
      sub: user.id,
      email: user.email,
      roles: user.roles as any,
      authMethod,
      mfaVerified: true,
    });

    return { user: this.toRequestUser(user), tokens };
  }

  /**
   * Builds the base application URL used for absolute links in emails.
   *
   * @returns The application base URL.
   */
  private getAppUrl(): string {
    return process.env.APP_URL ?? 'http://localhost:3000';
  }

  /**
   * Requests an email passcode login code for the given email address.
   *
   * Generates a one-time numeric passcode, stores its hash with an expiry and
   * delivers the code to the user by email. Always responds with a generic
   * success payload so the endpoint cannot be used to enumerate registered
   * emails.
   *
   * @param email - User email address.
   * @returns Generic success response.
   */
  async requestPasscode(email: string): Promise<{ success: boolean }> {
    this.logger.log(`Passcode request: ${email}`);

    const user = await this.usersService.findByEmail(email);
    if (user) {
      const { token } = await this.oneTimeTokenService.createToken(user.id, 'PASSCODE');
      if (this.mailerService) {
        await this.mailerService.sendMail({
          to: user.email,
          subject: 'Your login passcode',
          html: `<p>Your login passcode is: <strong>${token}</strong></p>`,
          text: `Your login passcode is: ${token}`,
        });
      }
    }

    return { success: true };
  }

  /**
   * Verifies an email passcode and completes the login flow.
   *
   * @param code - The one-time passcode submitted by the user.
   * @returns Authentication result with tokens, or an MFA challenge.
   */
  async verifyPasscode(code: string): Promise<AuthResult> {
    const { userId, authMethod } = await this.oneTimeTokenService.verifyToken(code);
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.completeLogin(user, authMethod);
  }

  /**
   * Verifies a JWT token and returns the decoded payload.
   *
   * @param token - JWT token string.
   * @returns Decoded JWT payload.
   */
  async verifyToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync(token);
  }

  /**
   * Converts a User entity to a RequestUser.
   *
   * @param user - User entity.
   * @returns RequestUser object.
   */
  private toRequestUser(user: User): RequestUser {
    return {
      sub: user.id,
      email: user.email,
      roles: user.roles as Role[],
      emailVerified: user.emailVerified,
      name: user.name ?? undefined,
    };
  }
}