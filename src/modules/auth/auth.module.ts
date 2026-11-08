import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';

import { UsersModule } from '../users/users.module.js';
import { DeviceAuthorization } from './entities/device-authorization.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OneTimeTokenService } from './one-time-token.service.js';
import { DeviceAuthorizationService } from './device-authorization.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { PasswordService } from './password.service.js';
import { TotpService } from './totp.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { AuthGuard } from './guards/auth.guard.js';
import { GlobalAuthGuard } from './guards/global-auth.guard.js';
import { OidcController } from './oidc/oidc.controller.js';
import { OidcProviderRegistry } from './oidc/oidc-provider-registry.js';
import { OidcService } from './oidc/oidc.service.js';
import { jwtConfig } from '../../config/jwt.config.js';

/**
 * Authentication module.
 *
 * Provides JWT-based authentication, OIDC provider integration,
 * two-factor authentication, and machine-to-machine flows.
 *
 * @module AuthModule
 */
@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([DeviceAuthorization, RefreshToken]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync(jwtConfig.asProvider()),
  ],
  controllers: [AuthController, OidcController],
  providers: [
    AuthService,
    PasswordService,
    TotpService,
    OneTimeTokenService,
    DeviceAuthorizationService,
    RefreshTokenService,
    JwtStrategy,
    JwtAuthGuard,
    AuthGuard,
    PermissionsGuard,
    RolesGuard,
    OidcProviderRegistry,
    OidcService,
    {
      provide: APP_GUARD,
      useClass: GlobalAuthGuard,
    },
  ],
  exports: [AuthService, PasswordService, TotpService, OneTimeTokenService, DeviceAuthorizationService, RefreshTokenService, JwtStrategy, JwtAuthGuard, AuthGuard, PermissionsGuard, RolesGuard, OidcProviderRegistry, OidcService, JwtModule, PassportModule],
})
export class AuthModule {}