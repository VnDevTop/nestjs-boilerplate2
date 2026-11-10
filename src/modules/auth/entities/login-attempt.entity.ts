import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../../database/base.entity.js';

/**
 * Failed login attempt and account lockout tracking.
 *
 * Stores per-identifier brute-force state (failed attempt counter, lockout
 * deadline, progressive lockout count) so the auth layer can enforce an
 * account lockout policy on top of the generic per-IP rate limiting.
 *
 * @class LoginAttempt
 */
@Entity('login_attempts')
export class LoginAttempt extends BaseEntity {
  /**
   * Normalized identifier the failure is tracked against (email address).
   * Indexed so lookups per account are cheap and lockouts are scoped per user.
   */
  @ApiProperty({
    type: String,
    example: 'attacker@example.com',
    description: 'Identifier (email) the failed attempts are tracked against.',
  })
  @Index()
  @Column({ type: 'varchar', length: 320 })
  identifier!: string;

  /**
   * Consecutive failed attempts within the current window.
   * Reset on successful login or when the window slides past `lastFailedAt`.
   */
  @ApiProperty({
    type: Number,
    default: 0,
    description: 'Consecutive failed attempts within the current window.',
  })
  @Column({ type: 'int', default: 0 })
  failedCount!: number;

  /**
   * Timestamp until which the account is locked (null when not locked).
   */
  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Account lockout deadline (null when not locked).',
  })
  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  /**
   * Timestamp of the last failed attempt.
   */
  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Timestamp of the last failed attempt.',
  })
  @Column({ type: 'timestamptz', nullable: true })
  lastFailedAt!: Date | null;

  /**
   * Number of lockouts the identifier has experienced (drives progressive
   * lockout duration: base duration doubles per each subsequent lockout).
   */
  @ApiProperty({
    type: Number,
    default: 0,
    description: 'Number of lockouts experienced by the identifier.',
  })
  @Column({ type: 'int', default: 0 })
  lockoutCount!: number;
}
