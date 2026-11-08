# Complete Authentication Guide — Step by Step (English Version)

> **Status:** Draft for Phase 8 — Authentication & Authorization (JWT).
> Describes all user states and authentication flows step by step before implementation.

---

## 1. Account Lifecycle (User States)

| State | Trigger | Details | Next step |
|---|---|---|---|
| **Registered** | `POST /auth/register` | User created with `emailVerified: false`, `passwordHash`, `roles: [USER]`; tokens issued immediately (auto-login) | Email verification / login |
| **Admin-created** | Admin user creation flow | Account provisioned by admin (likely with temporary password / forced MFA) | Force password change / MFA setup / login |
| **Active** | After registration / admin provisioning + password set | Can login via password / magic link / passcode / OIDC / device | MFA gate if enabled |
| **MFA disabled** | `POST /auth/mfa/disable` | TOTP disabled; login issues tokens directly with `mfaVerified: false` | Normal login |
| **MFA enabled** | `POST /auth/mfa/verify` (+ login flow `mfaRequired`) | TOTP enabled; login returns `{ mfaRequired: true, mfaToken }` | Verify TOTP via `POST /auth/mfa/verify-login` |
| **Device pending** | `POST /auth/device/code` | `DeviceAuthorization` persisted: `PENDING`, `expiresAt = now + TTL` | User approves via `user_code` |
| **Device approved** | `POST /auth/device/approve` (MFA-verified user) | Status → `APPROVED`, `userId` bound | Device polls → tokens issued |
| **Device denied / expired** | approve / deny / TTL | `DENIED` / `EXPIRED` | Poll returns final status; no tokens |

## 2. Login Flows — Step by Step

### 2.1 Email + Password Login

1. `POST /auth/login { email, password }` → `AuthService.login`
2. `validateUser` → `findByEmailWithPassword` (Argon2 `verify`) → invalid → `401 Invalid email or password`
3. If `user.totpEnabled === true` → `issueMfaToken(user, AuthMethod.PASSWORD)` → return `{ mfaRequired: true, mfaToken }`
4. Else → `issueTokens({ authMethod: PASSWORD, mfaVerified: false })` → return token pair

### 2.2 TOTP MFA Verify (login challenge)

1. `POST /auth/mfa/verify-login { code, mfaToken }` → `verifyMfaWithToken`
2. Verify JWT `type === 'mfa'`, load user with TOTP secret
3. `totpService.verifyTotp(code, secret)` → invalid → `{ enabled: false }`
4. Valid → `issueTokens({ authMethod: payload.authMethod ?? PASSWORD, mfaVerified: true })` → return tokens

### 2.3 Magic Link / Email Passcode Login

1. `POST /auth/magic-link/request { email }` → `OneTimeTokenService.createToken(userId, 'MAGIC_LINK')` → hash (Argon2id) → persist (`loginTokenHash`, TTL, `loginTokenConsumed: false`) → send email
2. `POST /auth/magic-link/verify { token }` → `OneTimeTokenService.verifyToken` → hash → `findByLoginTokenHash` → expiry / consumed checks → consume → `completeLogin(user, authMethod)`
3. `completeLogin` → if TOTP enabled → MFA challenge; else issue tokens with `authMethod: MAGIC_LINK`, `mfaVerified: true`
4. Same chain for passcode (`/auth/passcode/request`, `/auth/passcode/verify`) — note: `verifyToken` currently returns hardcoded `AuthMethod.MAGIC_LINK` (known gap to fix)

### 2.4 OIDC Login

1. Provider-specific callback → `OidcService` → user find-or-create by `sub`
2. Issue token pair with `authMethod: AuthMethod.OIDC`

### 2.5 Device Code Flow (Phase 8.3, implemented)

1. `POST /auth/device/code { clientId, scopes? }` → create `DeviceAuthorization` (`PENDING`, TTL 15m) → return `{ deviceCode, userCode, verificationUri, verificationUriComplete, expiresIn, interval }`
2. User approves: `POST /auth/device/approve { userCode }` (JWT required + `mfaVerified` required) → device `APPROVED`, bind `userId`
3. Device polls: `POST /auth/device/poll { deviceCode }` → `PENDING` → poll; `APPROVED` → issue tokens (`authMethod: DEVICE`, `mfaVerified: true`); `DENIED` → deny; `EXPIRED` → expired

## 3. Token Lifecycle

1. Access token: signed JWT, 15m TTL; refresh token: signed JWT, 7d TTL, `type: 'refresh'`
2. Refresh: `POST /auth/refresh` → verify refresh → rotate (revoke presented token, issue new pair) → on reuse revoke all user tokens (theft response)
3. Device tokens: issued via poll with `authMethod: DEVICE`, `mfaVerified: true

## 4. Security Gates (to be implemented in Phase 8.3)

1. **Brute-force protection** (Task 5): throttle on login / magic-link / passcode / device endpoints. *(Task 4 — refresh token rotation & reuse revocation — implemented)*
2. **Audit logging** (Task 6).
3. **JWT key versioning & rotation** (Task 7).
4. **Account security features** (Task 8).

---

*End of English Authentication Guide.*
