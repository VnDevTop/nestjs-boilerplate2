import { APP_GUARD, APP_PIPE } from "@nestjs/core";
import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from "@nestjs/bull";
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ResilienceModule } from '@nestjs/resilience';
import { IdempotencyModule } from '@nestjs/idempotency';
import { MailerModule } from '@nestjs-modules/mailer';
import { I18nModule, I18nValidationPipe } from "@nestjs/i18n";
import {
  appConfig,
  cacheConfig,
  corsConfig,
  databaseConfig,
  i18nConfig,
  jwtConfig,
  mailConfig,
  oidcConfig,
  observeConfig,
  queueConfig,
  retentionConfig,
  swaggerConfig,
  throttleConfig,
  bruteForceConfig,
  validateEnv
} from './config/index.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { UsersModule } from './modules/users/users.module.js';

export const {ObserveModule, ObserveInstrument} = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, observeConfig, cacheConfig, corsConfig, databaseConfig, swaggerConfig, i18nConfig, jwtConfig, oidcConfig, queueConfig, retentionConfig, mailConfig, throttleConfig, bruteForceConfig],
      validate: validateEnv,
    }),
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com,
    // then run `npx @nestjs/observe link` to write your key pair into .env.
    ConditionalModule.registerWhen(
      ObserveModule.forRootAsync(observeConfig.asProvider()),
      (env) =>
        !!env.OBSERVE_APP_KEY &&
        !!env.OBSERVE_APP_SECRET &&
        !!env.OBSERVE_SERVICE_ID,
    ),
    TypeOrmModule.forRootAsync(databaseConfig.asProvider()),
    // Distributed cache backed by Redis via KeyV (no in-memory fallback)
    CacheModule.registerAsync(cacheConfig.asProvider()),
    // Distributed job processing backed by Redis via BullMQ (no in-memory fallback)
    BullModule.forRootAsync(queueConfig.asProvider()),
    // Application-wide event emitter (in-process events)
    EventEmitterModule.forRoot(),
    // Task scheduling (cron jobs, intervals, timeouts)
    ScheduleModule.forRoot(),
    // Resilience (retries, timeouts, circuit breakers, bulkheads, fallbacks)
    ResilienceModule.forRoot(),
    // Idempotency support for safe retries of mutating requests
    IdempotencyModule.forRoot(),
    // Outbound email service via SMTP (Nodemailer)
    // Only register when mail credentials are provided
    ConditionalModule.registerWhen(
      MailerModule.forRootAsync(mailConfig.asProvider()),
      (env) =>
        !!env.MAIL_USERNAME &&
        !!env.MAIL_PASSWORD,
    ),
    // Conditionally activate i18n module when both I18N_DEFAULT_LOCALE and I18N_SUPPORTED_LOCALES are provided
    ConditionalModule.registerWhen(
      I18nModule.forRootAsync(i18nConfig.asProvider()),
      (env) =>
        !!env.I18N_DEFAULT_LOCALE &&
        !!env.I18N_SUPPORTED_LOCALES,
    ),
    // Rate limiting (throttling) — prevents abuse by limiting requests per IP
    ThrottlerModule.forRootAsync(throttleConfig.asProvider()),
    // Health check endpoints: GET /health and GET /health/ready
    HealthModule,
    // User management endpoints
    UsersModule,
    // Authentication & authorization
    AuthModule,
    // Admin endpoints
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useValue: new I18nValidationPipe({whitelist: true, transform: true}),
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    }
  ],
})
export class AppModule {}