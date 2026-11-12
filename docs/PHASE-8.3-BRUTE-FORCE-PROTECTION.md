# Phase 8.3 — Task 5: Brute-force protection — Implementation Plan

> **Date:** 2026-11-09
> **Branch:** `feat/auth/advanced-security`
> **Phase:** 8 — Authentication & authorization (JWT) → Phase 8.3 — Advanced security
> **Task:** `feat(security): add brute-force protection`
> **Status:** Implemented (2026-11-11) — next task: Task 6 — `feat(security): add audit logging`

---

## 1. Objective

Per `docs/PLAN.md` → Phase 8.3, Task 5:

> `feat(security): add brute-force protection`
> - Account lockout + throttling on auth endpoints.

**Current state assessment (baseline):**

- Throttling is already partially in place via `@nestjs/throttler` (v6.7.1):
  - `ThrottlerModule.forRootAsync(throttleConfig.asProvider())` + global `ThrottlerGuard` (`APP_GUARD` in `AppModule`).
  - `throttleConfig` (`src/config/throttle.config.ts`): `setHeaders: true`, single `default` throttler `{ ttl: THROTTLE_TTL ?? 60000, limit: THROTTLE_LIMIT ?? 100, blockDuration: THROTTLE_BLOCK_DURATION ?? 0 }`.
  - Per-route `@Throttle({ default: { limit, ttl } })` on: `POST /auth/login` (5/60s), `POST /auth/magic-link/request` (5/60s), `POST /auth/magic-link/verify` (10/60s), `POST /auth/passcode/request` (5/60s), `POST /auth/passcode/verify` (10/60s), `POST /auth/device/code` (5/60s), `POST /auth/device/approve` (10/60s), `POST /auth/device/poll` (30/60s). `POST /auth/register` and MFA endpoints carry no explicit limit yet.
  - Throttle backend: `CacheModule` backed by Redis via KeyV (distributed-capable).
  - E2E gate already exists and is green: `Security (e2e - brute force protection)` in `test/auth.e2e-spec.ts` (magic link → 429 after limit; login → 429 after limit).

- **Gap:** there is no *account lockout* layer. Failed login attempts are not tracked per account, so brute-force password guessing is only bounded by per-IP rate limiting and not by an account-level policy (failed-attempt threshold → lock).

**Goal of Task 5:** add account lockout on top of the existing throttling, integrate it into the auth flows (login, magic-link / passcode verify as applicable), and keep responses generic (anti user-enumeration).

---

## 2. Baseline / areas to change

| File | Role |
|------|------|
| `src/modules/auth/auth.controller.ts` | `@Throttle` metadata per endpoint; add missing limits (register / MFA) if in scope |
| `src/config/throttle.config.ts` | Throttler options, env (`THROTTLE_TTL`, `THROTTLE_LIMIT`, `THROTTLE_BLOCK_DURATION`) |
| `src/app.module.ts` | `ThrottlerModule` + global `ThrottlerGuard` |
| `src/config/cache.config.ts` | Redis (KeyV) cache backing throttling |
| `src/config/env.validation.ts`, `src/env.d.ts` | Env validation/types for throttle vars |
| `src/modules/auth/auth.service.ts` | `login` / `validateUser` / magic-link / passcode verify — failure recording + lockout checks |
| `src/modules/auth/entities/` | New brute-force state store (entity) |
| `src/database/migrations/` | New migration for the lockout store |
| `src/modules/auth/auth.module.ts` | Register new entity / service |
| `src/modules/users/entities/user.entity.ts` | Possibly reuse `status` or add fields |
| `src/modules/auth/auth.service.spec.ts`, `test/auth.e2e-spec.ts` | Unit + e2e tests |

---

## 3. Implementation design

### 3.1 Throttling baseline (already in place, keep)

- Global `ThrottlerGuard`; per-route `@Throttle` limits (login 5/60s, magic link / passcode 5/60s, verify 10/60s, device 5–30/60s).
- `setHeaders: true` (RateLimit headers), optional blanket block via `THROTTLE_BLOCK_DURATION` (default `0` = count-based 429 only).
- E2E gate: `Security (e2e - brute force protection)` — passing (429 after limit).

### 3.2 Account lockout design (proposed)

1. **Storage — failed-attempt state.**
   - Options: (a) dedicated `auth_login_attempts` entity/table (pattern: `refresh_tokens` / `device_authorizations`); (b) columns on `User` (`failedLoginAttempts`, `lockoutUntil`); (c) Redis/cache counter.
   - Proposal: dedicated store keyed by normalized identifier (email / user id) with `failedCount`, `lockedUntil`, `lastFailedAt` + cleanup of expired entries.
   - Decision point for plan review: keep state independent from admin lifecycle `UserStatus` (Phase 9.5 uses status transitions for admin lock/unlock) vs reuse user columns.

2. **Lockout policy — proposed defaults (env-tunable).**
   - `BRUTE_FORCE_MAX_ATTEMPTS` default `5` failed attempts within `BRUTE_FORCE_WINDOW_SECONDS` default `900` (15 min).
   - Lock duration: `BRUTE_FORCE_LOCKOUT_SECONDS` default `900` (15 min). Progressive lockout (doubling duration) is an optional follow-up.

3. **Enforcement — `AuthService` integration.**
   - Failed password verify → record failure; when threshold reached → lock (`lockedUntil`).
   - Successful login → reset failure counter.
   - While locked → reject early (before password verification) with generic message; auto-unlock when `lockedUntil` elapses.

4. **Magic link / passcode.**
   - Token-based brute force: throttles already bound to verify endpoints (10/60s); failed verifies consume the one-time token anyway. Optionally tie to lockout counters — decide in plan review (known gap: passcode verify currently hardcodes `AuthMethod.MAGIC_LINK` — to be fixed separately).

### 3.3 Task list & proposed commits (Task 3/4 pattern: one task = one commit)

1. `feat(security): add failed login attempt storage` — entity + migration + module registration.
2. `feat(security): add brute force protection service` — service: register failure / reset / is-locked / cleanup.
3. `feat(security): add account lockout to auth flows` — `AuthService` integration + module wiring.
   - **Main task commit: `feat(security): add brute-force protection`**
4. `test(security): add brute force protection tests` — unit + e2e.
5. `docs(phase-8): add task 5 brute force protection entry`.

### 3.4 Test plan

#### Unit — `src/modules/auth/auth.service.spec.ts`

- `login`: failed password → failure recorded via lockout service, throws `UnauthorizedException('Invalid email or password')`.
- `login`: N-th failure reaching max attempts → account locked → rejected (generic error, no password verify).
- `login`: successful credentials → failure counter reset.
- `login`: lock expiry elapsed → login allowed again.

#### E2E — `test/auth.e2e-spec.ts`

- Extend `Security (e2e - brute force protection)`:
  - Failed login attempts → account locked after configured threshold (or 429 via throttler, as currently covered).
  - Existing throttle tests keep passing (magic link / login → 429).

#### Quality gates

```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
npm run test:e2e
npm run test:cov
```

Same requirement as Task 3 / Task 4: **100% statements / functions / lines — PASS**.

---

## 4. Task list & proposed commits

(See §3.3 — summarized here for traceability with `docs/PLAN.md`.)

---

## 5. Validation & docs deliverable

```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
npm run test:e2e
npm run test:cov
```

Docs to update after task completion:

- `docs/PHASE-8.md` — add Task 5 entry under Phase 8.3 (mirroring Task 3 / Task 4 entries).
- `docs/PHASE-8.3-DEVICE-CODE-SUMMARY.md` — update: Task 5 completed → Task 6 (`feat(security): add audit logging`) is next task.
- `docs/PLAN.md` — verify progress checklist state for Phase 8.3.
- `docs/AUTH-GUIDE.md` — Security Gates: mark Task 5 implemented; document lockout behaviour.

---

## 6. Risks & architectural decisions

| Risk / decision | Analysis |
|----------------|----------|
| Storage choice: entity vs User columns vs Redis counter | Entity keeps brute-force state independent from admin lifecycle status (`UserStatus`, Phase 9.5 Task 5) — recommended for Task 5 scope. |
| Distributed deployments | Counters must be shared across instances → DB or Redis-backed store, **not** per-instance in-memory. Align with Redis (KeyV) used by the throttler cache. |
| Lockout vs throttle | Throttle = per-IP generic limit; lockout = per-account progressive policy → complementary, both retained. |
| Admin unlock integration | Lockout expiry (time-based) vs admin status-based lock/unlock (`Phase 9.5 — Task 5`) → integration point to keep in mind. |
| Known gaps (out of scope) | Passcode verify `AuthMethod` hardcoded to `MAGIC_LINK`; register endpoint missing explicit throttle. |

---

## 7. Related mechanisms in earlier plans

| Mechanism | Source in plan | Related task |
|-----------|----------------|--------------|
| **Persist refresh token hashes** (rotation/revocation) | `docs/PLAN.md` — Phase 8.1, Task 5 | 8.1 / 8.3.T4 |
| **Rotate refresh tokens on use; revoke reused tokens** | `docs/PLAN.md` — Phase 8.3, Task 4 | 8.3.T4 |
| **Account lockout / admin lock-unlock** | `docs/PLAN.md` — Phase 9.5, Task 5; Phase 8.7 bot protection | Task 8 / Phase 9.5.T5 / Phase 8.7 |

**Conclusion:** Task 5 builds on the already-shipped throttling layer and adds the per-account lockout. Logout / session revocation / suspicious alerts remain owned by Task 8 / Phase 8.7.

---

## 8. Open questions for plan review (proposed)

1. Brute-force store: dedicated `auth_login_attempts` table vs `User` columns vs Redis counter?
2. Locked response: generic `401` vs `423 Locked` / `429`?
3. Fixed vs progressive lockout window / duration?
4. Scope: include `POST /auth/register` and MFA endpoints in throttle coverage?
5. Magic-link / passcode: tie to lockout counters or keep throttle-only?

---

## 9. Related docs

- `docs/PLAN.md` — Phase 8.3 task list and progress tracking.
- `docs/PHASE-8.md` — Phase 8 task entries.
- `docs/PHASE-8.3-DEVICE-CODE-SUMMARY.md` — Task 3 / Task 4 status summary.
- `docs/PHASE-8.3-REFRESH-TOKEN-ROTATION.md` — Task 4 implementation plan (format reference).

---

*End of Task 5 implementation plan.*
