import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../common/interfaces/request-user.interface.js';
import { AuthService } from './auth.service.js';

/**
 * Authentication controller exposing login and registration endpoints.
 *
 * @class AuthController
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Registers a new user.
   */
  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async register(@Body() body: { email: string; password: string; name?: string }) {
    return this.authService.register(body.email, body.password, body.name);
  }

  /**
   * Authenticates a user and returns tokens.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  /**
   * Refreshes an access token using a refresh token.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refreshTokens(body.refreshToken);
  }

  /**
   * Requests a magic link login token for the given email address.
   */
  @Public()
  @Post('magic-link/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Request magic link login token' })
  @ApiResponse({ status: 200, description: 'Magic link sent or silently skipped for unknown email' })
  async requestMagicLink(@Body() body: { email: string }) {
    return this.authService.requestMagicLink(body.email);
  }

  /**
   * Verifies a magic link token and completes the login flow.
   */
  @Public()
  @Post('magic-link/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify magic link token and complete login' })
  @ApiResponse({ status: 200, description: 'Authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid or expired magic link token' })
  async verifyMagicLink(@Body() body: { token: string }) {
    return this.authService.verifyMagicLink(body.token);
  }

  /**
   * Requests an email passcode login code for the given email address.
   */
  @Public()
  @Post('passcode/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Request email passcode login code' })
  @ApiResponse({ status: 200, description: 'Passcode sent or silently skipped for unknown email' })
  async requestPasscode(@Body() body: { email: string }) {
    return this.authService.requestPasscode(body.email);
  }

  /**
   * Verifies an email passcode and completes the login flow.
   */
  @Public()
  @Post('passcode/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify email passcode and complete login' })
  @ApiResponse({ status: 200, description: 'Authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid or expired passcode' })
  async verifyPasscode(@Body() body: { code: string }) {
    return this.authService.verifyPasscode(body.code);
  }

  /**
   * Starts TOTP two-factor setup for the authenticated user.
   */
  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start TOTP two-factor setup' })
  @ApiResponse({ status: 200, description: 'TOTP secret generated' })
  async setupMfa(@CurrentUser() user: RequestUser) {
    return this.authService.setupMfa(user.sub, user.email ?? user.sub);
  }

  /**
   * Verifies a TOTP code and enables two-factor authentication.
   */
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify TOTP code and enable two-factor authentication' })
  @ApiResponse({ status: 200, description: 'Two-factor authentication enabled' })
  async verifyMfa(@Body() body: { code: string }, @CurrentUser() user: RequestUser) {
    return this.authService.verifyMfa(user.sub, user.email ?? user.sub, body.code);
  }

  /**
   * Verifies the MFA challenge token issued during login and exchanges it
   * for a fully authenticated token pair.
   */
  @Public()
  @Post('mfa/verify-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify TOTP challenge from login and issue tokens' })
  @ApiResponse({ status: 200, description: 'MFA verified; tokens issued' })
  async verifyLoginMfa(@Body() body: { code: string; mfaToken: string }) {
    return this.authService.verifyMfaWithToken(body.mfaToken, body.code);
  }

  /**
   * Disables two-factor authentication after verifying a TOTP code.
   */
  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Disable two-factor authentication' })
  @ApiResponse({ status: 200, description: 'Two-factor authentication disabled' })
  async disableMfa(@Body() body: { code: string }, @CurrentUser() user: RequestUser) {
    return this.authService.disableMfa(user.sub, user.email ?? user.sub, body.code);
  }

  /**
   * Requests a device authorization for the given OAuth2 client.
   */
  @Public()
  @Post('device/code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Request a device authorization code' })
  @ApiResponse({ status: 200, description: 'Device authorization issued' })
  async requestDeviceCode(@Body() body: { clientId: string; scopes?: string[] }) {
    return this.authService.requestDeviceCode(body.clientId, body.scopes);
  }

  /**
   * Approves a pending device authorization on behalf of the authenticated user.
   */
  @Post('device/approve')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Approve a pending device authorization' })
  @ApiResponse({ status: 200, description: 'Device authorization approved' })
  @ApiResponse({ status: 401, description: 'MFA is required or device code is invalid' })
  async approveDevice(@Body() body: { userCode: string }, @CurrentUser() user: RequestUser) {
    return this.authService.approveDevice(body.userCode, user);
  }

  /**
   * Polls the device authorization and returns tokens once approved.
   */
  @Public()
  @Post('device/poll')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Poll the device authorization for tokens' })
  @ApiResponse({ status: 200, description: 'Device authorization status or token pair' })
  @ApiResponse({ status: 401, description: 'Invalid device code' })
  async pollDevice(@Body() body: { deviceCode: string }) {
    return this.authService.pollDevice(body.deviceCode);
  }
}