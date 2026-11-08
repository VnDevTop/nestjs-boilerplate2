import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../../database/base.entity.js';

/**
 * Refresh token record for rotation and revocation.
 *
 * Persists the SHA-256/Argon2 hash of a refresh token together with its
 * expiry and consumed/revoked state so that:
 * - refresh tokens can be rotated on use (old token marked revoked),
 * - reused (replayed) tokens can be detected and all user tokens revoked.
 *
 * @class RefreshToken
 */
@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
  /**
   * Unique hash of the refresh token (deterministic Argon2 hash of the JWT).
   */
  @ApiProperty({
    type: String,
    example: 'a1b2c3d4e5f6...',
    description: 'Unique hash of the refresh token.',
  })
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  tokenHash!: string;

  /**
   * Identifier of the user the refresh token belongs to.
   */
  @ApiProperty({
    type: String,
    example: 'b2c3d4e5f6a7...',
    description: 'User identifier the refresh token belongs to.',
  })
  @Index()
  @Column({ type: 'varchar', length: 255 })
  userId!: string;

  /**
   * Expiration timestamp of the refresh token.
   */
  @ApiProperty({
    type: Date,
    description: 'Expiry timestamp of the refresh token.',
  })
  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  /**
   * Whether the refresh token has been consumed (rotated) or revoked.
   * Default: `false`
   */
  @ApiProperty({
    type: Boolean,
    default: false,
    description: 'Whether the refresh token has been consumed or revoked.',
  })
  @Column({ type: 'boolean', default: false })
  revoked!: boolean;
}
