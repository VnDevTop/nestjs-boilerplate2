# Phase 8.3 — Task 4: Refresh token rotation — Implementation Plan

> **Date:** 2026-11-08
> **Branch:** `feat/auth/advanced-security`
> **Phase:** 8 — Authentication & authorization (JWT) → Phase 8.3 — Advanced security
> **Task:** `feat(auth): add refresh token rotation`
> **Status:** Planned (next task after Task 3 — Device Code Flow, completed)

---

## 1. Objective

Per `docs/PLAN.md` → Phase 8.3, Task 4:

> `feat(auth): add refresh token rotation`
> - Rotate refresh tokens on use; revoke reused tokens.

Currently (`AuthService.refreshTokens`), the refresh flow is **stateless**:

1. Verify JWT with `jwtConfig().refreshSecret`, require `payload.type === 'refresh'`.
2. Load user, then `issueTokens` a new pair (access 15m + refresh 7d).
3. No storage, no rotation, no reuse detection.

Result: refresh tokens can be replayed undetected.

---

## 2. Baseline / areas to change

| File | Role |
|------|------|
| `src/modules/auth/auth.service.ts` | `issueTokens` (persist refresh hash), `refreshTokens` (rotate + reuse revoke) |
| `src/modules/auth/auth.module.ts` | Register `RefreshToken` entity + `RefreshTokenService` |
| `src/modules/auth/entities/device-authorization.entity.ts` | Reference pattern (entity + migration) |
| `src/modules/auth/one-time-token.service.ts` | Pattern for token hashing/TTL/persistence |
| `src/database/migrations/*` | New migration for `refresh_tokens` |
| `src/modules/auth/auth.service.spec.ts` | Unit tests for rotation/reuse |
| `test/auth.e2e-spec.ts` | E2E for refresh rotation & reuse |

---

## 3. Implementation design

### 3.1 Storage — `RefreshToken` entity + migration (Task 4.1)

- Create `src/modules/auth/entities/refresh-token.entity.ts` (`@Entity('refresh_tokens')`) extending `BaseEntity`:
  - `id`, `createdAt`, `updatedAt`, `deletedAt` (BaseEntity)
  - `userId: string` — index
  - `tokenHash: string` — unique index
  - `expiresAt: Date` — timestamptz
  - `revoked: boolean` — default `false`
- Migration: `src/database/migrations/1791465600000-add-refresh-tokens.ts` — `CREATE TABLE "refresh_tokens" (...)` + unique index `IDX_refresh_tokens_tokenHash` + index `IDX_refresh_tokens_userId`; `down` → `DROP TABLE`.
- Register entity in `AuthModule` via `TypeOrmModule.forFeature([DeviceAuthorization, RefreshToken])`.

Why a separate table instead of columns on `User`: a user can hold multiple concurrent sessions/devices, one refresh token each (similar to `loginTokenHash` but for many tokens).

### 3.2 `RefreshTokenService` — Task 4.2

Create `src/modules/auth/refresh-token.service.ts`, mirroring `OneTimeTokenService`:

- Argon2id (`argon2id`, memoryCost 65536, timeCost 3, parallelism 4) + fixed salt `Buffer.from('refresh-token')` → deterministic hash for exact-match lookup.
- `hashToken(token: string): Promise<string>`
- `create(userId: string, token: string): Promise<RefreshToken>` — hash token → `expiresAt = now + refreshTtlMs` (7d, same default as `OneTimeTokenService` hardcoded TTL) → save `{ userId, tokenHash, expiresAt, revoked: false }`.
- `findByTokenHash(tokenHash: string): Promise<RefreshToken | null>`
- `revoke(tokenHash: string): Promise<void>` — set `revoked = true` (token already rotated/consumed).
- `revokeAllForUser(userId: string): Promise<void>` — mark all still-valid tokens of the user as `revoked = true` (response when reuse / suspected theft).

### 3.3 Rotation logic — Task 4.3 (main commit: `feat(auth): add refresh token rotation`)

`AuthService.issueTokens`:

- After signing refresh JWT (`{...payload, type: 'refresh'}` with `refreshSecret`, TTL `refreshExpiresIn`):
  - `await this.refreshTokenService.create(payload.sub, refreshToken);`

`AuthService.refreshTokens(refreshToken)`:

1. Verify JWT with refresh secret → error → `UnauthorizedException('Invalid or expired refresh token')`.
2. `payload.type !== 'refresh'` → `UnauthorizedException('Invalid refresh token')`.
3. Load user by `payload.sub` → not found → `UnauthorizedException('User not found')`.
4. `tokenHash = await refreshTokenService.hashToken(refreshToken)`.
5. `stored = await refreshTokenService.findByTokenHash(tokenHash)`.
6. `!stored` → `UnauthorizedException('Invalid or expired refresh token')` (token not stored — e.g. token issued before rollout).
7. `stored.revoked === true` → **reuse detected**: `await refreshTokenService.revokeAllForUser(user.id)` → `UnauthorizedException('Refresh token reuse detected')`.
8. `stored.expiresAt < now` → `UnauthorizedException('Invalid or expired refresh token')` (expired → invalid, not reuse).
9. Rotate: `await refreshTokenService.revoke(stored.tokenHash)` (consume old) → `return this.issueTokens({ sub, email, roles, authMethod: payload.authMethod, mfaVerified: payload.mfaVerified })`.

Design note: when rotating, pass through `authMethod` / `mfaVerified` from the verified payload to keep MFA/device context for the new token (access + refresh receive these claims via `issueTokens`).

### 3.4 Module wiring — Task 4.3

- `AuthModule`:
  - `TypeOrmModule.forFeature([DeviceAuthorization, RefreshToken])`
  - Add `RefreshTokenService` to `providers` and `exports`.

---

## 4. Task list & proposed commits

Following Task 3 pattern (one task = one commit):

1. `feat(auth): add refresh token storage` — entity + migration + module forFeature.
2. `feat(auth): add refresh token service` — `RefreshTokenService`.
3. `feat(auth): add refresh token rotation` — `AuthService.issueTokens` persist + `refreshTokens` rotate/reuse-revoke + module wiring.
4. `test(auth): add refresh token rotation tests` — unit + e2e.
5. `docs(phase-8): add task 4 refresh token rotation entry`.

Main task commit: **`feat(auth): add refresh token rotation`**.

---

## 5. Test plan

### Unit — `src/modules/auth/auth.service.spec.ts`

Need to add `RefreshTokenService` mock provider (create / hashToken / findByTokenHash / revoke / revokeAllForUser) for both testing modules (with and without Mailer).

- `issueTokens`: token pair signed + `refreshTokenService.create` called with `(userId/sub, refreshToken)`.
- `refreshTokens` — happy path: valid token + `stored.revoked === false` + not expired → rotate (expect `revoke` with `stored.tokenHash`), return new pair, `create` called for new refresh token.
- `refreshTokens` — reuse: `stored.revoked === true` → `revokeAllForUser(user.id)` called, throws `UnauthorizedException('Refresh token reuse detected')`.
- `refreshTokens` — token not found in store → `UnauthorizedException`.
- `refreshTokens` — token expired (`expiresAt < now`) → `UnauthorizedException`.

Existing tests (`invalid`, `non-refresh`, `user not found`) must keep passing with the new structure.

### E2E — `test/auth.e2e-spec.ts`

- `POST /auth/refresh` with valid refresh token → `200` + new pair (rotation).
- Reuse of old (already rotated) refresh token → `401`.
- Refresh with new refresh token (rotation chaining) → `200`.

### Quality gates

```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
npm run test:e2e
npm run test:cov
```

Same requirement as Task 3: **100% statements / functions / lines** coverage.

---

## 6. Validation & docs deliverable

```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
npm run test:e2e
npm run test:cov
```

Docs to update after task completion:

- `docs/PHASE-8.md` — add Task 4 entry under Phase 8.3 (mirroring Task 3 entries).
- `docs/PHASE-8.3-DEVICE-CODE-SUMMARY.md` — update: Task 4 completed → Task 5 (brute-force) is next task.
- `docs/PLAN.md` — tick `- [ ] Phase 8.3 — Advanced security` in progress checklist.
- `docs/AUTH-GUIDE.md` — Token Lifecycle section: `POST /auth/refresh` → verify + **rotate** + revoke reuse; update Security Gates list (Task 4 done → Task 5 pending).

---

## 7. Risks & architectural decisions

| Risk / decision | Analysis |
|-----------------|----------|
| Old tokens (issued before rollout) no longer in store → cannot refresh | Acceptable; client refreshes once after deploy. This is an inherent consequence of mandatory rotation. |
| Reuse detection at user level (revoke all) vs token family | Chose user-level to limit task scope; family-level is next hardening. |
| Argon2 fixed-salt deterministic hash | Mirrors `OneTimeTokenService` — exact-match lookup possible; still memory-hard against GPU/ASIC. |
| MFA / device context on rotate | Preserve `authMethod` / `mfaVerified` from verified payload when re-issuing token. |

## 8. Related mechanisms in earlier plans (logout / revoke / device access)

In earlier plan docs (`docs/PLAN.md`, `docs/PHASE-8.md`, `docs/AUTH-GUIDE.md`), the following mechanisms were **already planned** and closely related to Task 4:

| Mechanism | Source in plan | Related task |
|-----------|----------------|--------------|
| **Persist refresh token hashes** (for rotation/revocation) | `docs/PLAN.md` — Phase 8.1, Task 5 | 8.1 / 8.3.T4 |
| **Rotate refresh tokens on use; revoke reused tokens** | `docs/PLAN.md` — Phase 8.3, Task 4 | **Current task** |
| **Logout** (`POST /auth/logout`) | `docs/PLAN.md` — Phase 8.1, Task 8 — Endpoints: register/login/refresh/logout | Phase 8.7, Task 1 (session revocation) |
| **Session revocation** (revoke session / revoke all) | `docs/PLAN.md` — Phase 8.7, Task 1; Phase 8.3, Task 8 (account security) | Task 8 / Phase 8.7.T1 |
| **Device access / access token from another device** | `docs/PHASE-8.3-DEVICE-CODE-SUMMARY.md` + `docs/PLAN.md` — Phase 8.3, Task 3 (device flow, MFA gate on approve); Phase 8.7, Task 1 (session metadata: device, ip, userAgent, lastUsedAt) | 8.3.T3 / 8.7.T1 |

**Conclusion:** Mechanisms for refresh token revoke / logout / device access **already appeared in previous plans**, not newly created. Current Task 4 covers only the "revoke reused tokens" step of the rotation chain; logout endpoint and session revocation are deferred to later tasks (Task 8 / Phase 8.7 Task 1).

---

*End of Task 4 implementation plan.*
