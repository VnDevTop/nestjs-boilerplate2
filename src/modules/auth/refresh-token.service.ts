import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';

import { RefreshToken } from './entities/refresh-token.entity.js';

/**
 * Refresh token service.
 *
 * Implements storage for refresh tokens used by the rotation flow:
 * - refresh tokens are signed JWTs issued by `AuthService.issueTokens`,
 * - only their deterministic Argon2 hash is persisted,
 * - each token carries an expiry and a consumed (`revoked`) flag.
 *
 * Rotation marks the presented token as revoked and persists the next
 * refresh token; reuse of a revoked token triggers revocation of all
 * tokens of the user (theft response).
 *
 * @class RefreshTokenService
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  /**
   * Default lifetime of a refresh token (7 days), mirroring the JWT refresh
   * TTL configured via `JWT_REFRESH_EXPIRES_IN` (default `7d`).
   */
  private readonly refreshTokenTtlMs: number = 7 * 24 * 60 * 60 * 1000;

  /**
   * Argon2id configuration parameters.
   *
   * - memoryCost: 64 MB — memory-hard to resist GPU/ASIC attacks
   * - timeCost: 3 — computational cost iterations
   * - parallelism: 4 — degree of parallelism
   */
  private readonly argon2Options: argon2.HashOptions = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  };

  /**
   * Fixed salt for refresh token hashes.
   *
   * Argon2 hashes are salted, but a fixed salt keeps the resulting hash
   * deterministic, which allows a presented token to be hashed and matched
   * against the stored hash directly (exact-match lookup).
   */
  private readonly tokenSalt: Buffer = Buffer.from('refresh-token');

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  /**
   * Hashes a refresh token using Argon2id (one-way, salted, memory-hard).
   *
   * The salt is fixed so the hash is deterministic and can be used for the
   * exact-match token lookup, while still benefiting from Argon2id's
   * memory-hard resistance against brute-force attacks.
   *
   * @param token - Refresh token string (signed JWT).
   * @returns The Argon2id hash of the token.
   */
  async hashToken(token: string): Promise<string> {
    return argon2.hash(token, { ...this.argon2Options, salt: this.tokenSalt });
  }

  /**
   * Persists a newly issued refresh token (hash + expiry, not revoked).
   *
   * @param userId - Identifier of the user the refresh token is issued for.
   * @param token - Signed refresh token JWT.
   * @returns The persisted refresh token record.
   */
  async create(userId: string, token: string): Promise<RefreshToken> {
    const tokenHash = await this.hashToken(token);
    const refreshToken = this.refreshTokenRepository.create({
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + this.refreshTokenTtlMs),
      revoked: false,
    });

    const saved = await this.refreshTokenRepository.save(refreshToken);
    this.logger.log(`Refresh token persisted for user: ${userId}`);
    return saved;
  }

  /**
   * Finds a refresh token by its hash.
   *
   * @param tokenHash - Hashed refresh token to look up.
   * @returns The refresh token record or null when unknown.
   */
  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.refreshTokenRepository.findOne({ where: { tokenHash } });
  }

  /**
   * Marks a refresh token as revoked (consumed by rotation or revoked).
   *
   * @param tokenHash - Hashed refresh token to revoke.
   * @returns void
   */
  async revoke(tokenHash: string): Promise<void> {
    await this.refreshTokenRepository.update({ tokenHash, revoked: false }, { revoked: true });
    this.logger.log(`Refresh token revoked: ${tokenHash}`);
  }

  /**
   * Revokes all active refresh tokens of a user.
   *
   * Used as a theft response when a reused (already revoked) refresh token
   * is detected during the rotation flow.
   *
   * @param userId - User identifier whose tokens should be revoked.
   * @returns void
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokenRepository.update({ userId, revoked: false }, { revoked: true });
    this.logger.log(`All refresh tokens revoked for user: ${userId}`);
  }
}
