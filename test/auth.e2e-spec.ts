import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TOTP } from '@otplib/totp';
import { NodeCryptoPlugin } from '@otplib/plugin-crypto-node';
import { ScureBase32Plugin } from '@otplib/plugin-base32-scure';
import { MailerService } from '@nestjs-modules/mailer';
import { JwtService } from '@nestjs/jwt';
import { vi } from 'vitest';
import { UsersService } from '../src/modules/users/users.service.js';
import { OneTimeTokenService } from '../src/modules/auth/one-time-token.service.js';
import { DeviceAuthorizationService } from '../src/modules/auth/device-authorization.service.js';
import {
  DeviceAuthorization,
  DeviceAuthorizationStatus,
} from '../src/modules/auth/entities/device-authorization.entity.js';
import { AppModule } from './../src/app.module.js';

const sendMailMock = vi.fn();

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let jwtService: JwtService;

  const email = () => `e2e-auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  const createTotpCode = async (secret: string): Promise<string> => {
    const totp = new TOTP({
      algorithm: 'sha1',
      digits: 6,
      period: 30,
      crypto: new NodeCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    });
    const code = await totp.generate({
      secret,
      crypto: new NodeCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    });
    return code;
  };

  const decodeToken = (token: string): any => jwtService.decode(token);

  beforeEach(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailerService)
      .useValue({ sendMail: sendMailMock })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('should register a new user and return tokens (auto-login)', async () => {
      const emailAddress = email();

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: emailAddress,
          password: 'password123',
          name: 'E2E User',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toHaveProperty('sub');
      expect(res.body.user.email).toBe(emailAddress);
      expect(res.body.user.emailVerified).toBe(false);
      expect(res.body.user.roles).toContain('USER');
      expect(res.body.tokens).toHaveProperty('accessToken');
      expect(res.body.tokens).toHaveProperty('refreshToken');
      expect(res.body.tokens.tokenType).toBe('Bearer');
    });

    it('should reject duplicate registration', async () => {
      const emailAddress = email();

      const firstRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123' });
      expect(firstRes.status).toBe(201);

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123' });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials and return tokens', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123' });
      expect(registerRes.status).toBe(201);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: emailAddress, password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.user).toHaveProperty('sub');
      expect(res.body.tokens).toHaveProperty('accessToken');
      expect(res.body.tokens).toHaveProperty('refreshToken');
      expect(res.body.mfaRequired).toBeFalsy();
    });

    it('should reject invalid password with 401', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123' });
      expect(registerRes.status).toBe(201);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: emailAddress, password: 'wrong-password' });

      expect(res.status).toBe(401);
    });

    it('should reject unknown email with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: `unknown-${Date.now()}@example.com`, password: 'password123' });

      expect(res.status).toBe(401);
    });

    it('should return mfaRequired + mfaToken when user has TOTP enabled', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123', name: 'TOTP User' });
      expect(registerRes.status).toBe(201);
      const accessToken = registerRes.body.tokens.accessToken;

      const setupRes = await request(app.getHttpServer())
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      expect(setupRes.status).toBe(200);
      const code = await createTotpCode(setupRes.body.secret);

      const verifyRes = await request(app.getHttpServer())
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.enabled).toBe(true);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: emailAddress, password: 'password123' });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.mfaRequired).toBe(true);
      expect(loginRes.body.mfaToken).toBeDefined();
      expect(loginRes.body.tokens).toBeUndefined();
    });
  });

  describe('POST /auth/mfa/verify-login', () => {
    it('should exchange a valid mfaToken + TOTP code for tokens', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123', name: 'TOTP User' });
      expect(registerRes.status).toBe(201);
      const accessToken = registerRes.body.tokens.accessToken;

      const setupRes = await request(app.getHttpServer())
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      const code = await createTotpCode(setupRes.body.secret);

      const verifyRes = await request(app.getHttpServer())
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.enabled).toBe(true);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: emailAddress, password: 'password123' });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.mfaRequired).toBe(true);

      const mfaVerifyRes = await request(app.getHttpServer())
        .post('/auth/mfa/verify-login')
        .send({ code, mfaToken: loginRes.body.mfaToken });

      expect(mfaVerifyRes.status).toBe(200);
      expect(mfaVerifyRes.body.enabled).toBe(true);
      expect(mfaVerifyRes.body.tokens).toHaveProperty('accessToken');
      expect(mfaVerifyRes.body.tokens).toHaveProperty('refreshToken');

      const accessTokenMfa = mfaVerifyRes.body.tokens.accessToken;
      const decodedAccess = decodeToken(accessTokenMfa);
      expect(decodedAccess.mfaVerified).toBe(true);
      expect(decodedAccess.authMethod).toBe('PASSWORD');
      expect(decodedAccess.exp - decodedAccess.iat).toBe(900);
    });

    it('should not issue tokens when the TOTP code is invalid', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123', name: 'TOTP User' });
      const accessToken = registerRes.body.tokens.accessToken;

      const setupRes = await request(app.getHttpServer())
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      const code = await createTotpCode(setupRes.body.secret);

      const verifyRes = await request(app.getHttpServer())
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code });
      expect(verifyRes.status).toBe(200);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: emailAddress, password: 'password123' });
      expect(loginRes.status).toBe(200);

      const mfaVerifyRes = await request(app.getHttpServer())
        .post('/auth/mfa/verify-login')
        .send({ code: '000000', mfaToken: loginRes.body.mfaToken });

      expect(mfaVerifyRes.status).toBe(200);
      expect(mfaVerifyRes.body.enabled).toBe(false);
      expect(mfaVerifyRes.body.tokens).toBeUndefined();
    });

    it('should reject an mfaToken that is not a valid MFA token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/mfa/verify-login')
        .send({ code: '123456', mfaToken: 'invalid-mfa-token' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/mfa (e2e - TOTP two-factor lifecycle)', () => {
    it('should setup, verify and disable TOTP', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123', name: 'TOTP User' });
      expect(registerRes.status).toBe(201);
      const accessToken = registerRes.body.tokens.accessToken;

      const setupRes = await request(app.getHttpServer())
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      expect(setupRes.status).toBe(200);
      expect(setupRes.body).toHaveProperty('secret');
      expect(setupRes.body).toHaveProperty('otpauthUrl');
      expect(setupRes.body.qrCode).toContain('data:');

      const code = await createTotpCode(setupRes.body.secret);
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.enabled).toBe(true);

      // After enabling, login must go through the MFA challenge again.
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: emailAddress, password: 'password123' });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.mfaRequired).toBe(true);

      // Disable with the valid TOTP code, then login must issue tokens directly.
      const disableRes = await request(app.getHttpServer())
        .post('/auth/mfa/disable')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code });
      expect(disableRes.status).toBe(200);
      expect(disableRes.body.enabled).toBe(true);

      const loginAfterDisableRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: emailAddress, password: 'password123' });

      expect(loginAfterDisableRes.status).toBe(200);
      expect(loginAfterDisableRes.body.mfaRequired).toBeFalsy();
      expect(loginAfterDisableRes.body.tokens).toHaveProperty('accessToken');
    });
  });

  describe('POST /auth/refresh', () => {
    it('should issue a new token pair with a valid refresh token', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123' });
      expect(registerRes.status).toBe(201);

      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: registerRes.body.tokens.refreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body).toHaveProperty('accessToken');
      expect(refreshRes.body).toHaveProperty('refreshToken');

      const decodedRefresh = decodeToken(refreshRes.body.refreshToken);
      expect(decodedRefresh.type).toBe('refresh');
      expect(decodedRefresh.exp - decodedRefresh.iat).toBe(604800); // 7 days
    });

    it('should reject an invalid refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' });

      expect(res.status).toBe(401);
    });

    it('should rotate the refresh token on use and reject reuse of the rotated token', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123' });
      expect(registerRes.status).toBe(201);

      const firstRefreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: registerRes.body.tokens.refreshToken });
      expect(firstRefreshRes.status).toBe(200);
      const rotatedRefreshToken = firstRefreshRes.body.refreshToken;

      // The rotated token must be usable for the next refresh (rotation chaining).
      const secondRefreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: rotatedRefreshToken });
      expect(secondRefreshRes.status).toBe(200);

      // Reusing the already-rotated (consumed) token is rejected.
      const reuseRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: registerRes.body.tokens.refreshToken });
      expect(reuseRes.status).toBe(401);
    });
  });

  describe('Protected routes', () => {
    it('should access protected route with valid token', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123' });
      const accessToken = registerRes.body.tokens.accessToken;

      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
    });

    it('should reject access without token', async () => {
      const res = await request(app.getHttpServer()).get('/users/me');

      expect(res.status).toBe(401);
    });

    it('should reject access with invalid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });

    it('should reject a refresh token used as an access token', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: email(), password: 'password123' });
      const refreshToken = registerRes.body.tokens.refreshToken;

      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${refreshToken}`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/magic-link (e2e - magic link flow)', () => {
    it('should silently accept requests for unknown emails', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/magic-link/request')
        .send({ email: `unknown-${Date.now()}@example.com` });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success');
      expect(res.body.success).toBe(true);
    });

    it('should verify a valid magic link token and complete login', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123', name: 'Magic User' });
      expect(registerRes.status).toBe(201);

      const oneTimeTokenService = moduleFixture.get<OneTimeTokenService>(OneTimeTokenService);
      const usersService = moduleFixture.get<UsersService>(UsersService);
      const user = await usersService.findByEmail(emailAddress);
      if (!user) {
        throw new Error('User not found after registration');
      }
      const { token } = await oneTimeTokenService.createToken(user.id, 'MAGIC_LINK');

      const verifyRes = await request(app.getHttpServer())
        .post('/auth/magic-link/verify')
        .send({ token });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body).toHaveProperty('tokens');
      expect(verifyRes.body.tokens).toHaveProperty('accessToken');

      const decoded = decodeToken(verifyRes.body.tokens.accessToken);
      expect(decoded.authMethod).toBe('MAGIC_LINK');
      expect(decoded.mfaVerified).toBe(true);
    });

    it('should reject an invalid magic link token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/magic-link/verify')
        .send({ token: 'invalid-magic-token' });

      expect(res.status).toBe(401);
    });

    it('should reject an already consumed magic link token', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123', name: 'Magic User' });
      expect(registerRes.status).toBe(201);

      const oneTimeTokenService = moduleFixture.get<OneTimeTokenService>(OneTimeTokenService);
      const usersService = moduleFixture.get<UsersService>(UsersService);
      const user = await usersService.findByEmail(emailAddress);
      if (!user) {
        throw new Error('User not found after registration');
      }
      const { token } = await oneTimeTokenService.createToken(user.id, 'MAGIC_LINK');

      const firstRes = await request(app.getHttpServer())
        .post('/auth/magic-link/verify')
        .send({ token });
      expect(firstRes.status).toBe(200);

      const secondRes = await request(app.getHttpServer())
        .post('/auth/magic-link/verify')
        .send({ token });
      expect(secondRes.status).toBe(401);
    });

    it('should reject an expired magic link token', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123', name: 'Magic User' });
      expect(registerRes.status).toBe(201);

      const oneTimeTokenService = moduleFixture.get<OneTimeTokenService>(OneTimeTokenService);
      const usersService = moduleFixture.get<UsersService>(UsersService);
      const user = await usersService.findByEmail(emailAddress);
      if (!user) {
        throw new Error('User not found after registration');
      }
      const { token } = await oneTimeTokenService.createToken(user.id, 'MAGIC_LINK');
      await usersService.updateProfile(user.id, {
        loginTokenExpiresAt: new Date(Date.now() - 60 * 1000),
        loginTokenConsumed: false,
      });

      const res = await request(app.getHttpServer())
        .post('/auth/magic-link/verify')
        .send({ token });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/passcode (e2e - passcode flow)', () => {
    it('should silently accept passcode requests for unknown emails', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/passcode/request')
        .send({ email: `unknown-${Date.now()}@example.com` });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success');
      expect(res.body.success).toBe(true);
    });

    it('should verify a valid passcode and complete login', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123', name: 'Passcode User' });
      expect(registerRes.status).toBe(201);

      const oneTimeTokenService = moduleFixture.get<OneTimeTokenService>(OneTimeTokenService);
      const usersService = moduleFixture.get<UsersService>(UsersService);
      const user = await usersService.findByEmail(emailAddress);
      if (!user) {
        throw new Error('User not found after registration');
      }
      const { token: passcode } = await oneTimeTokenService.createToken(user.id, 'PASSCODE');

      const verifyRes = await request(app.getHttpServer())
        .post('/auth/passcode/verify')
        .send({ code: passcode });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body).toHaveProperty('tokens');
      expect(verifyRes.body.tokens).toHaveProperty('accessToken');

      const decoded = decodeToken(verifyRes.body.tokens.accessToken);
      expect(decoded.authMethod).toBe('PASSCODE');
      expect(decoded.mfaVerified).toBe(true);
    });

    it('should reject an invalid passcode', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/passcode/verify')
        .send({ code: '000000' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/device (e2e - device code flow)', () => {
    it('should issue a device authorization and poll pending status', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123', name: 'Device User' });
      expect(registerRes.status).toBe(201);

      const deviceRes = await request(app.getHttpServer())
        .post('/auth/device/code')
        .send({ clientId: 'nestjs-device-client', scopes: ['openid'] });

      expect(deviceRes.status).toBe(200);
      expect(deviceRes.body).toHaveProperty('deviceCode');
      expect(deviceRes.body).toHaveProperty('userCode');
      expect(deviceRes.body.verificationUri).toContain(deviceRes.body.userCode);
      expect(deviceRes.body.expiresIn).toBeGreaterThan(0);
      expect(deviceRes.body.expiresIn).toBeLessThanOrEqual(900); // 15 minutes
      expect(deviceRes.body.interval).toBe(5);

      const pollRes = await request(app.getHttpServer())
        .post('/auth/device/poll')
        .send({ deviceCode: deviceRes.body.deviceCode });

      expect(pollRes.status).toBe(200);
      expect(pollRes.body.status).toBe(DeviceAuthorizationStatus.PENDING);
      expect(pollRes.body.tokens).toBeUndefined();
    });

    it('should reject a poll with an unknown device code', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/device/poll')
        .send({ deviceCode: 'unknown-device-code' });

      expect(res.status).toBe(401);
    });

    it('should not allow approving a device without MFA verification', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123', name: 'Device User' });
      expect(registerRes.status).toBe(201);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: emailAddress, password: 'password123' });
      expect(loginRes.status).toBe(200);
      const accessToken = loginRes.body.tokens.accessToken;

      const deviceRes = await request(app.getHttpServer())
        .post('/auth/device/code')
        .send({ clientId: 'nestjs-device-client' });
      expect(deviceRes.status).toBe(200);

      const approveRes = await request(app.getHttpServer())
        .post('/auth/device/approve')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ userCode: deviceRes.body.userCode });

      expect(approveRes.status).toBe(401);
    });

    it('should complete the device flow: approve with MFA token, poll, and exchange tokens', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123', name: 'Device User' });
      expect(registerRes.status).toBe(201);
      const accessToken = registerRes.body.tokens.accessToken;

      const setupRes = await request(app.getHttpServer())
        .post('/auth/mfa/setup')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      const code = await createTotpCode(setupRes.body.secret);
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/mfa/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ code });
      expect(verifyRes.status).toBe(200);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: emailAddress, password: 'password123' });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.mfaRequired).toBe(true);

      const mfaVerifyRes = await request(app.getHttpServer())
        .post('/auth/mfa/verify-login')
        .send({ code, mfaToken: loginRes.body.mfaToken });
      expect(mfaVerifyRes.status).toBe(200);

      const deviceRes = await request(app.getHttpServer())
        .post('/auth/device/code')
        .send({ clientId: 'nestjs-device-client' });
      expect(deviceRes.status).toBe(200);

      const approveRes = await request(app.getHttpServer())
        .post('/auth/device/approve')
        .set('Authorization', `Bearer ${mfaVerifyRes.body.tokens.accessToken}`)
        .send({ userCode: deviceRes.body.userCode });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe(DeviceAuthorizationStatus.APPROVED);

      const pollRes = await request(app.getHttpServer())
        .post('/auth/device/poll')
        .send({ deviceCode: deviceRes.body.deviceCode });

      expect(pollRes.status).toBe(200);
      expect(pollRes.body.status).toBe(DeviceAuthorizationStatus.APPROVED);
      expect(pollRes.body.tokens).toHaveProperty('accessToken');
      expect(pollRes.body.tokens).toHaveProperty('refreshToken');

      const deviceAccessToken = pollRes.body.tokens.accessToken;
      const decodedDeviceToken = decodeToken(deviceAccessToken);
      expect(decodedDeviceToken.authMethod).toBe('DEVICE');
      expect(decodedDeviceToken.mfaVerified).toBe(true);

      const meRes = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${deviceAccessToken}`);
      expect(meRes.status).toBe(200);
    });

    it('should return DENIED status once the device was denied', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123', name: 'Device User' });
      expect(registerRes.status).toBe(201);

      const deviceRes = await request(app.getHttpServer())
        .post('/auth/device/code')
        .send({ clientId: 'nestjs-device-client' });
      expect(deviceRes.status).toBe(200);

      const deviceAuthorizationService = moduleFixture.get<DeviceAuthorizationService>(DeviceAuthorizationService);
      await deviceAuthorizationService.deny(deviceRes.body.deviceCode);

      const pollRes = await request(app.getHttpServer())
        .post('/auth/device/poll')
        .send({ deviceCode: deviceRes.body.deviceCode });

      expect(pollRes.status).toBe(200);
      expect(pollRes.body.status).toBe(DeviceAuthorizationStatus.DENIED);
      expect(pollRes.body.tokens).toBeUndefined();
    });

    it('should return EXPIRED status once the device authorization TTL elapsed', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123', name: 'Device User' });
      expect(registerRes.status).toBe(201);

      const deviceRes = await request(app.getHttpServer())
        .post('/auth/device/code')
        .send({ clientId: 'nestjs-device-client' });
      expect(deviceRes.status).toBe(200);

      const deviceRepository = moduleFixture.get<Repository<DeviceAuthorization>>(
        getRepositoryToken(DeviceAuthorization),
      );
      const deviceAuthorization = await deviceRepository.findOne({
        where: { deviceCode: deviceRes.body.deviceCode },
      });
      if (!deviceAuthorization) {
        throw new Error('Device authorization not found');
      }
      deviceAuthorization.expiresAt = new Date(Date.now() - 60 * 1000);
      await deviceRepository.save(deviceAuthorization);

      const pollRes = await request(app.getHttpServer())
        .post('/auth/device/poll')
        .send({ deviceCode: deviceRes.body.deviceCode });

      expect(pollRes.status).toBe(200);
      expect(pollRes.body.status).toBe(DeviceAuthorizationStatus.EXPIRED);
      expect(pollRes.body.tokens).toBeUndefined();
    });
  });

  describe('Security (e2e - brute force protection)', () => {
    it('should throttle magic link requests after the configured limit', async () => {
      const emailAddress = email();

      const results = [];
      for (let i = 0; i < 6; i++) {
        const res = await request(app.getHttpServer())
          .post('/auth/magic-link/request')
          .send({ email: i === 0 ? emailAddress : `throttle-${i}-${Date.now()}@example.com` });
        results.push(res.status);
      }

      for (const status of results.slice(0, -1)) {
        expect(status).toBe(200);
      }
      expect(results[results.length - 1]).toBe(429);
    });

    it('should throttle login attempts after the configured limit', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123' });
      expect(registerRes.status).toBe(201);

      const results = [];
      for (let i = 0; i < 6; i++) {
        const res = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: emailAddress, password: 'wrong-password' });
        results.push(res.status);
      }

      for (const status of results.slice(0, -1)) {
        expect(status).toBe(401);
      }
      expect(results[results.length - 1]).toBe(429);
    });

    it('should reject login with valid credentials while the account is locked', async () => {
      const emailAddress = email();

      const registerRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: emailAddress, password: 'password123' });
      expect(registerRes.status).toBe(201);

      // Exhaust the failed attempt threshold via wrong passwords.
      for (let i = 0; i < 5; i++) {
        const res = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: emailAddress, password: 'wrong-password' });
        expect(res.status).toBe(401);
      }

      // The account is locked: even valid credentials must be rejected.
      const lockedRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: emailAddress, password: 'password123' });

      expect(lockedRes.status).toBe(429);
    });
  });
});
