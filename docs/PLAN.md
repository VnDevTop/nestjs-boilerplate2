# Plan: NestJS Boilerplate — Production-Ready Roadmap

> **Repository:** https://github.com/VnDevTop/nestjs-boilerplate.git  
> **Initial version:** `v12.0.0` (NestJS v12)  
> **Status:** Planning document (no implementation in this file)

---

## 0. Purpose

This plan describes the end-to-end process for turning the current minimal NestJS scaffold into a
production-grade, reusable boilerplate. It is written for review: every phase lists the branch to
create, the tasks to perform, the commit messages to use, and the validation commands to run.

Goals:

1. Standardised, production-ready repository.
2. Comprehensive, modern NestJS package coverage.
3. Large test suite with high coverage.
4. Easy to understand and extend (native NestJS packages + full documentation).
5. Security-first design aligned with HIPAA §164.312, ISO 27001, and OWASP ASVS.

---

## 1. Conventions

### 1.1 Branching

- Default branch: `master`.
- Branch naming: `feat/<topic>`, `docs/<topic>`, `chore/<topic>`, `ci/<topic>`, `perf/<topic>`.
- One branch per phase (or per sub-phase where noted).
- Merge to `master` only via Pull Request on GitHub.

### 1.2 Commits

- Format: `type(scope): description` (Conventional Commits).
- One task = at least one commit.
- Dependency upgrades: one commit per dependency.
- Documentation files: one commit per file.
- Config vs. workflow: one commit per part.

### 1.3 Quality gates (run after every task)

```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
npm run test:e2e
docker build -t nestjs-boilerplate .
```

### 1.4 Runtime baseline

- Node.js >= 24 (latest) for local dev and CI.
- npm >= 11.
- Prefer official `@nestjs/*` packages whenever available.
- Validation: `class-validator`, `class-transformer`, `zod`.
- ORM: TypeORM with PostgreSQL.
- Cache: `@nestjs/cache-manager` + `keyv` + Redis (no in-memory fallback).

### 1.5 Merge policy (manual review)

- After each task, stop and evaluate locally.
- Do **not** auto-merge.
- Open a PR, review, then merge manually on GitHub.
- At the end of each phase, add detailed docs describing what was done.

### 1.6 README maintenance

- Keep folder-level `README.md` (in `src/common`, `src/core`, `src/modules`, and subfolders) up to date.
- At the end of **every** phase **and sub-phase**, update the affected folder `README.md` files to reflect new/changed structure, components, and conventions.

---

## 2. Phase overview

| # | Phase | Branch (example) | Status | Outcome |
|---|-------|------------------|--------|---------|
| 0 | Skeleton | `chore/skeleton` | Planned | Runnable NestJS project skeleton |
| 1 | Code quality | `chore/code-quality` | Planned | Husky + commitlint |
| 2 | CI workflow | `ci/github-actions` | Planned | Verify / test / coverage / build workflows |
| 3 | CodeQL | `ci/codeql` | Planned | CodeQL config + analysis workflow |
| 4 | Metadata & dependency upgrades | `chore/package-metadata` | Planned | Updated metadata, latest dependencies |
| 5 | Project docs & process files | `docs/project-documentation` | Planned | README, CHANGELOG, SECURITY, skill, plan |
| 6 | Structure & core packages | `feat/project-structure`, `feat/core-packages` | Planned | Modular layout + cross-cutting packages |
| 7.0 | Shared enums & types | `feat/users` | Planned | Common enums/types for users and auth (phases 7-9) |
| 7 | User module | `feat/users` | Planned | OIDC-compliant user model & service |
| 8.0 | Auth module skeleton | `feat/auth` | Planned | Auth module skeleton & shared wiring |
| 8 | Authentication & authorization | `feat/auth` (+ sub-phases) | Planned | JWT, OIDC providers, 2FA, M2M |
| 9 | Performance & production hardening | `perf/optimization` | Planned | Speed, caching, hardening |
| 10+ | Enhancement | `feat/enhancement` | Planned | Advanced query, search, tenancy, DX |

---

## 3. Phase details

### Phase 0 — Skeleton

**Branch:** `chore/skeleton`  
**Status:** Planned

#### Tasks

1. `chore(skeleton): initialize nestjs project with nest cli`
   - Scaffold with `@nestjs/cli`, TypeScript, ESM (`"type": "module"`).
   - NestJS CLI generates the base project (src layout, app module/controller/service, lint/format/test tooling, gitignore).
   - Add/verify `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`.

2. `chore(skeleton): establish src directory structure (config, core, common, modules, database)`
   - Create directories:
     - `src/config`
     - `src/core`
     - `src/database`
     - `src/modules`
     - `src/common` with subfolders:
       - `src/common/constants`       (metadata keys, header names, app-wide limits)
       - `src/common/decorators`      (@Public, @CurrentUser, @Roles, @ManagerOnly, @Permissions, @DeviceName)
       - `src/common/enums`          (Role, and other shared enums)
       - `src/common/exceptions`     (domain exceptions)
       - `src/common/filters`        (AllExceptionsFilter, HttpExceptionFilter)
       - `src/common/guards`         (JwtAuthGuard, RolesGuard, ManagerGuard, PermissionsGuard)
       - `src/common/interceptors`   (ResponseTransformInterceptor)
       - `src/common/interfaces`     (ApiResponse, JwtPayload, RequestUser)
       - `src/common/middlewares`    (RequestIdMiddleware)
       - `src/common/pagination`     (cursor + the two paged-response shapes)
       - `src/common/pipes`          (global validation pipe)
       - `src/common/query`          (query layer: spec, criteria, SQL builder)
       - `src/common/search`         (search language: tokenizer, parser, AST)
       - `src/common/tenancy`        (tenant context, scoped repository, DB scope)
       - `src/common/utils`          (password, encryption, recovery codes, user agent, request id)
   - Add barrel exports where useful.

3. `docs(structure): add README.md for common, core, and modules folders`
   - `src/common/README.md`, `src/core/README.md`, `src/modules/README.md` (and per-subfolder `README.md` where useful).
   - Each README describes the folder's purpose, its subfolders, and conventions, so the skeleton layout can be reviewed at a glance.
   - These READMEs are living docs: update them at the end of every phase (see §1.6).
   - Document the `common` tree exactly as:
     ```
     common
     ├── constants     metadata keys, header names, app wide limits
     ├── decorators    @Public, @CurrentUser, @Roles, @ManagerOnly, @Permissions, @DeviceName
     ├── enums         Role
     ├── filters       AllExceptionsFilter, HttpExceptionFilter
     ├── guards        JwtAuthGuard, RolesGuard, ManagerGuard, PermissionsGuard
     ├── interceptors  ResponseTransformInterceptor
     ├── interfaces    ApiResponse, JwtPayload, RequestUser
     ├── middlewares   RequestIdMiddleware
     ├── pagination    the cursor and the two shapes a paged response has
     ├── query         the query layer: a spec, a criteria, and the SQL they produce
     ├── search        the search language: a tokenizer, a parser and a tree
     ├── tenancy       the tenant context, the scoped repository and the database scope
     ├── pipes         global validation pipe
     └── utils         password, encryption, recovery codes, user agent, request id
     ```

#### Validation

```bash
npm run lint
npm run build
npm test
```

#### Docs deliverable

- Update affected folder `README.md` files (see §1.6).
- `docs/PHASE-0.md` summarising the skeleton.

---

### Phase 1 — Code quality packages

**Branch:** `chore/code-quality`  
**Status:** Planned

#### Tasks

1. `chore(deps): add husky and commitlint dependencies`
   - Add `husky`, `@commitlint/cli`, `@commitlint/config-conventional`.

2. `chore(commitlint): configure conventional commit rules`
   - Add `commitlint.config.cjs`.
   - Define allowed types: `feat`, `fix`, `chore`, `docs`, `ci`, `test`, `perf`, `refactor`, `style`.
   - Enforce scope and subject-case rules.

3. `chore(husky): add commit-msg hook and prepare script`
   - Add `.husky/commit-msg`.
   - Add `"prepare": "husky"` to `package.json`.

4. `docs(ai): add AI tool rules requiring full JSDoc and ApiProperty metadata`
   - Add AI assistant rules (e.g. `.opencode/rules` or project skill) instructing that every created/modified file, class, and function must include complete JSDoc (description, params, returns, throws, examples where useful).
   - Require `@ApiProperty`/`@ApiPropertyOptional` with `type`, `example`, `description` for DTO/entity properties.
   - Rule: always implement JSDoc for new/changed code; do not modify or remove existing JSDoc unless strictly necessary (e.g., signature change) — preserve documentation to keep community maintainability.
   - Ensure JSDoc and API metadata are enforced for maintainability and SDK generation.

5. `chore(jsdoc): enforce JSDoc via oxlint and husky pre-commit`
   - Use oxlint (project standard) instead of eslint-plugin-jsdoc.
   - Enable oxlint jsdoc rules if available; otherwise rely on code review + AI skill rules.
   - Add `.husky/pre-commit` hook running `npm run lint` to block commits with lint errors.
   - Note: commitlint only validates commit messages; JSDoc quality is enforced via oxlint rules (where supported) + AI skill + review.

#### Validation

```bash
npx commitlint --from HEAD~1 --to HEAD --verbose
npm run lint
```

#### Docs deliverable

- Update affected folder `README.md` files (see §1.6).
- `docs/PHASE-1.md`.

---

### Phase 2 — CI workflow (GitHub Actions)

**Branch:** `ci/github-actions`  
**Status:** Planned

#### Tasks

1. `ci(verify): add lint, typecheck, and build workflow`
   - `.github/workflows/verify.yml`.
   - Use latest Node.js version (>= 24) for all steps.
   - Steps: checkout, setup Node (latest), install, lint, `tsc --noEmit`, build.

2. `ci(test): add unit and e2e test workflow`
   - `.github/workflows/test.yml`.
   - Use latest Node.js version (>= 24).
   - Services: PostgreSQL, Redis.
   - Run `npm test` and `npm run test:e2e`.

3. `ci(coverage): add test coverage reporting`
   - Upload coverage artifacts / report.
   - Fail below threshold (e.g. 80%).

4. `ci(build): add build artifact workflow (no push)`
   - Build Docker image (`docker build`) without pushing.
   - Upload build artifacts.

#### Validation

- Push branch and confirm all workflows green.

#### Docs deliverable

- Update affected folder `README.md` files (see §1.6).
- `docs/PHASE-2.md`.

---

### Phase 3 — CodeQL

**Branch:** `ci/codeql`  
**Status:** Planned

#### Tasks

1. `ci(codeql): add codeql configuration`
   - `.github/codeql/codeql-config.yml`.
   - Query suites: `security-and-quality`.
   - Paths ignore: `dist`, `coverage`, `node_modules`.

2. `ci(codeql): add codeql analysis workflow`
   - `.github/workflows/codeql.yml`.
   - Use latest Node.js to minimise warnings.
   - Languages: `javascript-typescript`.

#### Validation

- CodeQL workflow runs successfully with zero high/critical findings.

#### Docs deliverable

- Update affected folder `README.md` files (see §1.6).
- `docs/PHASE-3.md`.

---

### Phase 4 — Metadata & dependency upgrades

**Branch:** `chore/package-metadata`  
**Status:** Planned

#### Tasks

1. `chore(package): update metadata and engine requirements`
   - `name`, `description`, `author`, `contributors`.
   - `repository`, `bugs`, `homepage`, `keywords`, `license`.
   - `engines`: `node >= 24`, `npm >= 11`.

2. Dependency upgrades (one commit per dependency)
   - Upgrade each dependency in `package.json` to its latest compatible version.
   - Commit message: `chore(deps): upgrade <package> to <version>`.
   - Include both `dependencies` and `devDependencies`.
   - Verify build/tests after each upgrade.

#### Validation

```bash
npm outdated
npm run lint
npm run build
npm test
```

#### Docs deliverable

- Update affected folder `README.md` files (see §1.6).
- `docs/PHASE-4.md` listing upgraded packages and versions.

---

### Phase 5 — Project documentation & process files

**Branch:** `docs/project-documentation`  
**Status:** Planned

#### Tasks

1. `docs(readme): rewrite readme for boilerplate project`
   - Project description, setup, scripts, badges.

2. `docs(changelog): add changelog`
   - Initial entry `v12.0.0`.

3. `docs(security): add security policy`
   - Vulnerability reporting, supported versions.

4. `docs(skill): add project skill`
   - `.opencode/skills/nestjs-boilerplate/SKILL.md`.

5. `docs(plan): add project roadmap`
   - This file.

6. `docs(contributing): add contribution guide`
   - Branching, commits, PR process.

7. `docs(license): add license file`
   - Add `LICENSE` (MIT or chosen license).
   - Update `package.json` license field accordingly.

#### Validation

- Markdown lint (if configured).
- Links resolve.

#### Docs deliverable

- Update affected folder `README.md` files (see §1.6).
- `docs/PHASE-5.md`.

---

### Phase 6 — Structure & core packages

Split into sub-phases. Each feature = one task = at least one commit.
**Branch:** `feat/project-structure`, `feat/core-packages`  
**Status:** Planned

#### Phase 6.0 — Project structure

Tasks:

1. `feat(structure): establish modular src layout`
   - Directories (README.md files for these folders already created in Phase 0):
     - `src/common/{constants,decorators,dto,enums,exceptions,filters,guards,interceptors,interfaces,middlewares,pagination,pipes,query,search,tenancy,utils}`
     - `src/config`
     - `src/database`
     - `src/modules/{auth,users,health,mail,cache,queue,i18n,http,compliance}`

2. `chore(config): add configuration module and env validation`
   - `@nestjs/config`.
   - `src/config/configuration.ts`, `src/config/env.validation.ts` (Joi or class-validator).
   - Validate all required env vars at startup.

3. `chore(database): add typeorm with postgresql and base entity`
   - `@nestjs/typeorm`, `typeorm`, `pg`.
   - PostgreSQL connection via config.
   - `src/database/base.entity.ts` (`id`, `createdAt`, `updatedAt`, `deletedAt`).
   - Migrations setup + initial migration.

4. `docs(structure): document folder conventions`
   - `docs/STRUCTURE.md`.
   - Document the `@ApiProperty` convention (`type`, `example`, `description`) for DTOs/entities.

5. `chore(deps): add phase 1 runtime dependencies`

#### Phase 6.1 — Cross-cutting core packages

**Branch:** `feat/core-packages`

Tasks (one commit per package):

1. `chore(deps): add phase 2 dependencies`
2. `feat(swagger): add openapi documentation`
   - `@nestjs/swagger`.
   - Two docs links: `/api/docs` (normal user) and `/api/docs/admin` (admin, non-prod or role-gated).
   - Convention: every DTO and entity property exposed in API must use `@ApiProperty`/`@ApiPropertyOptional` with `type`, `example`, and `description` (for SDK generation and API docs).
3. `feat(validation): add class-validator and class-transformer`
   - Global `ValidationPipe` (whitelist, transform, forbidNonWhitelisted).
4. `feat(validation): add zod support`
   - `zod` (+ `nestjs-zod` if used).
5. `feat(config): refine typed configuration namespaces`
   - `registerAs` for each config.
   - Export `ModuleOption` types for `registerAsync` / `forRootAsync`.
   - `src/env.d.ts` declares `NodeJS.ProcessEnv`.
6. `feat(health): add terminus health checks`
   - `/health`, `/health/ready`.
7. `feat(cache): add cache manager`
   - `@nestjs/cache-manager`, `cache-manager`, `keyv`, `@keyv/redis`.
   - Redis-backed, **no memory fallback**.
8. `feat(queue): add bullmq queues`
   - `@nestjs/bullmq`, `bullmq`.
9. `feat(mail): add mailer`
   - `@nestjs/mailer`, `nodemailer`, `handlebars`.
10. `feat(i18n): add internationalization`
    - `nestjs-i18n`.
11. `feat(http): add axios http module`
    - `@nestjs/axios`.
12. `feat(throttle): add rate limiting`
    - `@nestjs/throttler`, `@nestjs-redis/throttler-storage`.
13. `feat(helmet): add security headers`
    - `helmet`.
14. `feat(cors): add cors support`
15. `feat(events): add event emitter`
    - `@nestjs/event-emitter`.
16. `feat(schedule): add scheduler`
    - `@nestjs/schedule`.
17. `chore(config): move ProcessEnv declaration to env.d.ts`
18. `chore(config): use module option types directly`
19. `chore(app): shorten config imports via barrel`
20. `test(config): add config unit tests`

#### Phase 6.2 — Reliability (recommended, optional sub-phase)

**Branch:** `feat/reliability`

Tasks:

1. `chore(deps): add phase 3 dependencies`
   - `@nestjs/resilience`, `@nestjs/idempotency`.
2. `feat(resilience): add resilience module`
3. `feat(resilience): configure retry and timeout policies`
4. `feat(resilience): add circuit breaker and bulkhead`
5. `feat(resilience): add fallback handlers`
6. `feat(idempotency): add idempotency module`
7. `test(resilience): add reliability tests`

#### Validation (Phase 6)

```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
npm run test:e2e
```

#### Docs deliverable

- Update affected folder `README.md` files (see §1.6).
- `docs/PHASE-6.md`.

---

### Phase 7 — User module (OIDC-compliant data)

**Branch:** `feat/users`

Split into small sub-phases.
**Status:** Planned

#### Phase 7.0 — Shared enums & types (users + auth)

1. `feat(users): add shared enums for users and auth`
   - Create `src/common/enums/role.enum.ts` (`Role`: ADMIN, MANAGER, USER, ...).
   - Create `src/common/enums/user-status.enum.ts` (`UserStatus`: ACTIVE, INACTIVE, SUSPENDED, ...).
   - Create `src/common/enums/token-type.enum.ts` (`TokenType`: ACCESS, REFRESH, ...).
   - Create `src/common/enums/auth-method.enum.ts` (`AuthMethod`: PASSWORD, OIDC, MFA, ...).
   - Create `src/common/enums/oidc-provider.enum.ts` (`OidcProvider`: GOOGLE, MICROSOFT, GITHUB, APPLE, FACEBOOK, X).
   - Place module-specific enums under `src/modules/{users,auth}/enums`.

2. `feat(users): add shared types and interfaces for users and auth`
   - Create `src/common/interfaces/jwt-payload.interface.ts`.
   - Create `src/common/interfaces/request-user.interface.ts`.
   - Create `src/common/interfaces/oidc-claims.interface.ts`.
   - Create `src/common/interfaces/auth-result.interface.ts`.
   - Create `src/common/interfaces/token-pair.interface.ts`.

3. `chore(types): add barrel exports for shared enums and types`
   - Add `src/common/enums/index.ts` re-exporting all enums.
   - Add `src/common/interfaces/index.ts` re-exporting all interfaces.
   - Update `src/common/index.ts` barrel.

4. `docs(types): document shared enum and type usage`
   - Create `docs/SHARED-TYPES.md` (or section in `docs/STRUCTURE.md`) describing each enum/type and where to use it.

#### Phase 7.1 — Data model

1. `feat(users): add user entity compliant with oidc claims`
   - Create `src/modules/users/entities/user.entity.ts` extending `BaseEntity`.
   - Fields: `sub`, `email`, `emailVerified`, `name`, `givenName`, `familyName`, `picture`, `locale`, `roles`, `status`.
   - Align property names/types with OIDC standard claims for Phase 8 consumption.
   - Add TypeORM column decorators and indexes (unique on `sub`, `email`).
   - Add `@ApiProperty` with `type`, `example`, `description` for each exposed property.

2. `feat(users): add user repository`
   - Create `src/modules/users/repositories/user.repository.ts`.
   - Implement `findBySub`, `findByEmail`, `create`, `update`, `softDelete`.
   - Register repository in `UsersModule`.

#### Phase 7.2 — Service & API

1. `feat(users): add users service`
   - Create `src/modules/users/users.service.ts`.
   - Implement `create`, `findById`, `findByEmail`, `updateProfile`, `changeRoles`, `deactivate`.
   - Inject `UserRepository`; add logging and error handling.

2. `feat(users): add user profile endpoints`
   - Create `src/modules/users/users.controller.ts`.
   - Endpoints: `GET /users/me`, `PATCH /users/me`, `GET /users/:id` (admin).
   - Add DTOs under `src/modules/users/dto/` (create/update profile).
   - Each DTO property uses `@ApiProperty`/`@ApiPropertyOptional` with `type`, `example`, `description`.

3. `feat(users): add role management`
   - Add `RolesGuard` integration and `@Roles()` decorator usage.
   - Endpoints: `PATCH /users/:id/roles` (admin-only).
   - Validate role transitions and audit changes.

4. `feat(users): add data retention and cleanup hooks`
   - Add soft-delete handling and retention policy config.
   - Add scheduled cleanup hook (ties to `@nestjs/schedule`).
   - Document retention period in config.

#### Phase 7.3 — Tests & docs

1. `test(users): add user unit tests`
   - Unit tests for `UsersService` (create, update, roles, soft delete).
   - Mock repository; cover success and error paths.

2. `test(users): add user e2e tests`
   - E2E tests for profile endpoints and role management.
   - Use test DB/Redis fixtures.

3. `docs(users): document oidc claim mapping`
   - Create `docs/PHASE-7.md` with OIDC claim → entity field mapping table.

#### Validation

```bash
npm test
npm run test:e2e
```

#### Docs deliverable

- Update affected folder `README.md` files (see §1.6).
- `docs/PHASE-7.md`.

---

### Phase 8 — Authentication & authorization (JWT)

Split into multiple small phases.

**Branch:** `feat/auth` (+ sub-branches)  
**Status:** Planned

#### Phase 8.0 — Auth module skeleton & shared wiring

1. `feat(auth): add auth module skeleton`
   - Create `src/modules/auth/auth.module.ts`, `auth.controller.ts`, `auth.service.ts`.
   - Register `JwtModule`, `PassportModule`.
   - Add `AuthModule` to `AppModule`.

#### Phase 8.1 — Basic JWT auth

**Branch:** `feat/auth-basic`

Tasks (one component per task/commit — guards, pipes, services, controllers are kept separate):

1. `feat(auth): add auth dto and validation pipes`
   - Create DTOs: `RegisterDto`, `LoginDto`, `RefreshTokenDto` under `src/modules/auth/dto/`.
   - Apply class-validator decorators (email, password strength, etc.).
   - Create auth-specific validation pipe or reuse global pipe with config.
   - Each DTO property uses `@ApiProperty`/`@ApiPropertyOptional` with `type`, `example`, `description`.

2. `feat(auth): add password hashing service (argon2/bcrypt)`
   - Create `src/modules/auth/services/password.service.ts`.
   - Implement `hash`, `verify` using argon2 (preferred) or bcrypt.
   - Add config for algorithm/cost.

3. `feat(auth): add user registration service`
   - Implement `register()` in `AuthService`: validate uniqueness, hash password, create user.
   - Emit event / send welcome email hook.

4. `feat(auth): add login service (email/password)`
   - Implement `login()`: verify credentials, check status/lockout, issue tokens.
   - Integrate brute-force protection hooks.

5. `feat(auth): add jwt access and refresh token service`
   - Create `src/modules/auth/services/token.service.ts`.
   - Issue short-lived access tokens and rotating refresh tokens.
   - Persist refresh token hashes (for rotation/revocation).

6. `feat(auth): add jwt strategy (passport)`
   - Create `src/modules/auth/strategies/jwt.strategy.ts`.
   - Configure `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`.
   - Extract user from token and attach to request.

7. `feat(auth): add jwt auth guard`
   - Create `src/modules/auth/guards/jwt-auth.guard.ts`.
   - Handle public routes via `@Public()` decorator.

8. `feat(auth): add auth controller (register/login/refresh/logout)`
   - Endpoints: `POST /auth/register`, `/login`, `/refresh`, `/logout`.
   - Wire services; return token pair.

9. `feat(auth): add roles decorator and roles guard`
   - Create `@Roles()` decorator and `RolesGuard`.
   - RBAC enforcement based on user roles.

10. `feat(auth): add permissions decorator and permissions guard`
    - Create `@Permissions()` decorator and `PermissionsGuard`.
    - Permission-based authorization.

11. `feat(auth): add manager guard`
    - Create `ManagerGuard` for manager-only routes.

12. `feat(auth): add admin module foundation`
    - Create `src/modules/admin` with basic admin endpoints/guards.

#### Phase 8.2 — OIDC providers

**Branch:** `feat/auth-oidc`

1. `feat(auth): add oidc provider abstraction`
   - Create `OidcProvider` interface in `src/modules/auth/oidc/`.
   - Add registry/factory and config-driven enable/disable.

2. `feat(auth): implement google oidc provider`
   - Implement Google provider (client id/secret, callback, profile mapping).

3. `feat(auth): implement microsoft oidc provider`
   - Implement Microsoft (Azure AD) provider.

4. `feat(auth): implement github oidc provider`
   - Implement GitHub provider.

5. `feat(auth): implement apple oidc provider`
   - Implement Apple provider (Sign in with Apple).

6. `feat(auth): implement facebook oidc provider`
   - Implement Facebook provider.

7. `feat(auth): implement x (twitter) oidc provider`
   - Implement X (Twitter) provider.

8. `feat(auth): add provider registration and config`
   - Register providers in module; add env config and validation.

#### Phase 8.3 — Advanced security

**Branch:** `feat/auth-security`

1. `feat(auth): add two-factor authentication (totp)`
   - Implement TOTP setup/verify; QR code generation; recovery codes.

2. `feat(auth): add passcode / magic link login`
   - Implement email passcode and magic link flows.

3. `feat(auth): add device code flow`
   - Implement device authorization grant flow.

4. `feat(auth): add refresh token rotation`
   - Rotate refresh tokens on use; revoke reused tokens.

5. `feat(security): add brute-force protection`
   - Account lockout + throttling on auth endpoints.

6. `feat(security): add audit logging`
   - Log auth events and sensitive actions.

7. `feat(auth): add jwt key versioning and rotation`
   - `kid` + version; verify with previous keys during rotation.

8. `feat(security): add account security features`
   - Password change, session revocation, suspicious login alerts.

#### Phase 8.4 — Machine-to-machine

**Branch:** `feat/auth-m2m`

1. `feat(auth): add client credentials flow`
   - Implement OAuth2 client credentials grant for M2M.

2. `feat(auth): add api key authentication`
   - API key issuance, validation, and scoping.

#### Phase 8.5 — Cache-backed auth & notifications

1. `feat(auth): add auth cache service (token/session cache)`
   - Cache validated tokens/sessions in Redis.

2. `feat(auth): add cached auth guard`
   - Guard using cache to avoid repeated verification.

3. `feat(auth): add cached authorization (roles/permissions) guard`
   - Cache authorization decisions.

4. `feat(notifications): add notification module foundation`
   - Create notifications module with email/in-app channels.

#### Phase 8.6 — Tests

**Branch:** `feat/auth-tests`

1. `test(auth): add auth and security tests`
   - Unit/e2e tests for registration, login, guards, 2FA, brute-force.

2. `test(auth): add oidc provider tests`
   - Tests for each provider with mocked HTTP.

3. `test(auth): improve auth coverage`
   - Raise coverage to threshold; add edge cases.

#### Phase 8.7 — Session, password history & bot protection

1. `feat(auth): add session & device management`
   - Endpoints: list active sessions/devices, revoke session, revoke all.
   - Store session metadata (device, ip, userAgent, lastUsedAt).

2. `feat(auth): add password history & reuse prevention`
   - Store hashed previous passwords; reject reuse within N.

3. `feat(security): add captcha/bot protection on auth endpoints`
   - Integrate captcha provider; verify token on register/login.

4. `feat(security): add account enumeration protection`
   - Generic error messages; constant-time compare.

#### Validation (Phase 8)

```bash
npm test
npm run test:e2e
```

#### Docs deliverable

- Update affected folder `README.md` files (see §1.6).
- `docs/PHASE-8.md` (and sub-phase notes).

---

### Phase 9 — Performance & production hardening

**Branch:** `perf/optimization`  
**Status:** Planned

#### Phase 9.1 — Performance

1. `perf(app): enable compression middleware`
   - Add compression middleware; configure threshold.

2. `perf(database): add indexes and query optimization`
   - Add indexes on hot columns; optimize queries.

3. `perf(database): add query result caching`
   - Cache frequent queries via cache manager.

4. `perf(cache): optimize cache keys and ttl`
   - Standardize key naming; tune TTLs.

5. `perf(serialization): add serialization interceptor`
   - Add response serialization interceptor.

6. `perf(build): optimize tsconfig and bundle`
   - Tune tsconfig and build output.

7. `test(perf): add performance benchmarks`
   - Add benchmark tests.

8. `docs(perf): document optimization decisions`
   - Document trade-offs.

#### Phase 9.2 — Production hardening

1. `feat(hardening): production hardening baseline`
   - Security headers, error handling, logging.

2. `feat(hardening): operational hardening`
   - Health checks, graceful shutdown, readiness.

3. `feat(integration): optional integration foundation`
   - Optional third-party integration hooks.

4. `feat(config): configuration expansion`
   - Expand config namespaces and validation.

#### Phase 9.3 — Email & queue

1. `feat(mail): outbound email`
   - Implement mail sending via mailer module.

2. `feat(mail): configurable email templates`
   - Handlebars templates; config-driven.

3. `feat(queue): background job queue`
   - BullMQ queues and processors.

4. `feat(queue): job progress and cancellation`
   - Progress tracking and cancellation.

#### Phase 9.4 — Testing & docs

1. `test(core): testing depth improvements`
   - Increase coverage and edge cases.

2. `docs(core): documentation improvements`
   - Improve core docs.

3. `perf(build): optimize tsconfig and bundle`
   - Further build optimizations.

#### Phase 9.5 — User account management & password recovery

1. `feat(users): add email verification flow`
   - Endpoints: `POST /auth/verify-email`, `POST /auth/resend-verification`.
   - Token generation/validation; set `emailVerified`.

2. `feat(users): add forgot password and reset password flow`
   - Endpoints: `POST /auth/forgot-password`, `POST /auth/reset-password`.
   - Generate secure reset token, store hashed, email link.
   - Validate token expiry and one-time use; update password.

3. `feat(users): add self-service profile update`
   - Endpoints: `PATCH /users/me/password`, `PATCH /users/me/profile`.
   - Require current password for password change.
   - Validate and update name/email/etc.

4. `feat(admin): add admin user management endpoints`
   - Endpoints: `POST /admin/users`, `PATCH /admin/users/:id`, `DELETE /admin/users/:id`.
   - Admin can create, edit, lock/unlock, soft-delete users.
   - Role/permission guards; audit logging.

5. `feat(users): add account lock/unlock and status management`
   - Status transitions (ACTIVE/INACTIVE/SUSPENDED).
   - Lockout integration with brute-force protection.

6. `test(users): add tests for password recovery and admin management`
   - Unit/e2e tests for flows and guards.

#### Phase 9.6 — Realtime, file storage & API versioning

1. `feat(realtime): add websocket gateway`
   - Socket.IO gateway under `src/modules/realtime`.
   - Authenticated connections via JWT; rooms/channels.

2. `feat(storage): add file upload and storage`
   - Multipart upload endpoint; validation (type/size).
   - Storage providers: local/S3/GCS/Azure (config-driven).

3. `feat(storage): add presigned urls`
   - Generate presigned upload/download URLs.

4. `feat(storage): add image processing & thumbnails`
   - Resize/optimize images; generate thumbnails.

5. `feat(storage): add file virus scanning`
   - Scan uploads with antivirus engine.

6. `feat(api): add api versioning strategy`
   - URI/header versioning; versioned controllers.

4. `test(realtime): add websocket and upload tests`
   - E2E tests for connections and uploads.

#### Phase 9.7 — Observability, seeding & dev tooling

1. `feat(logging): add structured logging`
   - Pino/Winston logger; request/correlation id; PII masking.

2. `feat(metrics): add prometheus metrics`
   - Metrics endpoint; default + custom metrics.

3. `chore(db): add seed scripts and factories`
   - Seeders and faker-based factories for dev/test.

4. `chore(dev): add docker compose for dev`
   - `docker-compose.yml` for Postgres + Redis.

5. `ci(deps): add dependabot configuration`
   - `.github/dependabot.yml` for npm.

6. `feat(logging): add log rotation`
   - Configure log rotation and retention.

7. `feat(config): add secrets management integration`
   - Vault/AWS Secrets Manager (config-driven).

8. `perf(db): add read replicas & connection pooling config`
   - Configure read replicas and pool settings.

9. `docs(ops): add database backup & restore guide`

10. `feat(api): add deprecation strategy & Sunset headers`
    - Mark deprecated endpoints; add Sunset headers.

11. `feat(mail): add email template i18n`
    - Localized email templates.

12. `feat(notifications): add notification preferences`
    - User notification channel preferences.

13. `feat(users): add user onboarding flow`
    - Onboarding steps and tracking.

14. `perf(http): add etag & conditional requests`
    - ETag generation and 304 handling.

#### Phase 9.8 — Data lifecycle & caching

1. `feat(users): add soft-delete restore`
   - Endpoint to restore soft-deleted users (admin).

2. `perf(cache): add cache invalidation strategy & warming`
   - Invalidation hooks on writes; warmup on startup.

#### Phase 9.9 — Reliability (outbox)

1. `feat(events): add outbox pattern`
   - Reliable event publishing with outbox table.

#### Validation

```bash
npm run build
npm test
```

#### Docs deliverable

- Update affected folder `README.md` files (see §1.6).
- `docs/PHASE-9.md`.

---

### Phase 10+ — Enhancement (planned)

**Branch:** `feat/enhancement`  
**Status:** Planned

#### Phase 10.1 — Query & search

1. `feat(query): cursor pagination`
   - Implement cursor-based pagination.

2. `feat(query): reusable query criteria object`
   - Create query criteria builder.

3. `feat(search): lucene query parser`
   - Parser for search queries.

4. `feat(search): field registry and translators`
   - Field registry and translator layer.

5. `feat(search): postgres translator`
   - Translate search AST to SQL.

6. `feat(search): user search`
   - User search endpoint.

7. `docs(search): search documentation`
   - Document search syntax.

#### Phase 10.2 — Audit & observability read surface

1. `feat(audit): audit read surface`
   - Audit log read endpoints.

2. `feat(observability): metrics and tracing baseline`
   - Metrics and tracing setup.

#### Phase 10.4 — Compliance & data lifecycle

1. `feat(compliance): add gdpr dsar endpoints`
   - Data export and deletion requests.

2. `feat(compliance): add consent and terms tracking`
   - Track user consent and terms acceptance.

3. `feat(compliance): add pii masking in logs`
   - Mask PII in logs and error reports.

4. `feat(compliance): add cookie consent`
   - Cookie consent management.

5. `feat(compliance): add privacy policy & tos versioning`
   - Version and track policy acceptance.

6. `feat(compliance): add age verification`
   - Age verification flow.

#### Phase 10.5 — Integrations & advanced identity

1. `feat(webhooks): add outbound webhooks`
   - Webhook registration, delivery, retries, signature.

2. `feat(flags): add feature flags`
   - Config/service for feature toggles.

3. `feat(notifications): add push and sms`
   - Push/SMS notification channels.

4. `feat(identity): add advanced identity`
   - Passkeys, SAML, SCIM.

5. `feat(graphql): add graphql module (optional)`
   - GraphQL API layer.

6. `feat(admin): add admin panel foundation`
   - Admin UI/API foundation.

7. `feat(tenancy): add multi-tenancy support`
   - Tenant context, scoped repos, DB scope.

8. `feat(observability): deep opentelemetry integration`
   - Traces, metrics, logs via OTel.

#### Phase 10.3 — Future enhancements (backlog)

- Remaining experimental items and spikes.

#### Validation

```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
npm run test:e2e
```

#### Docs deliverable

- Update affected folder `README.md` files (see §1.6).
- `docs/PHASE-10.md`.

---

### Phase 11+ — Optional domain modules (planned)

**Branch:** `feat/optional-modules`  
**Status:** Planned

#### Phase 11.1 — Payments & billing (optional)

1. `feat(payments): add payment processing (stripe)`
2. `feat(billing): add subscription & invoicing`
3. `feat(billing): add tax calculation`

#### Phase 11.2 — Analytics & experimentation (optional)

1. `feat(analytics): add analytics & tracking baseline`
2. `feat(experiments): add a/b testing & experiments`

#### Validation

```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
npm run test:e2e
```

#### Docs deliverable

- Update affected folder `README.md` files (see §1.6).
- `docs/PHASE-11.md`.

---
## 4. Security & compliance mapping

| Feature | HIPAA §164.312 | ISO 27001 | OWASP ASVS |
|---------|----------------|-----------|------------|
| Authentication (JWT, OIDC, MFA) | §164.312(d) | A.9 | V2 |
| Authorization (RBAC) | §164.312(a)(1) | A.9 | V4 |
| Audit logging | §164.312(b) | A.12 | V7 |
| Rate limiting / brute-force protection | §164.312(c)(1) | A.13 | V2 |
| Security headers (Helmet, CORS) | §164.312(e)(1) | A.13 | V14 |
| Input validation | §164.312(c)(1) | A.14 | V5 |
| Encryption in transit (TLS) | §164.312(e)(1) | A.13 | V9 |
| Data lifecycle / soft delete | §164.312(c)(2) | A.8 | V8 |
| Vulnerability scanning (CodeQL) | §164.312(a)(2) | A.12 | V14 |

---

## 5. Release process

After each phase:

1. Open PR from feature branch to `master`.
2. Review and merge manually.
3. Tag: `v12.0.x` (increment patch per phase).
4. Push tag to GitHub.
5. Create GitHub Release with generated notes.
6. Update `CHANGELOG.md`.

First release: `v12.0.0`.

---

## 6. Risk register

| Risk | Mitigation |
|------|------------|
| OIDC provider API changes | Keep behind abstraction; config-driven enable/disable |
| Dependency upgrade breakage | One commit per dependency; run full quality gates |
| Compliance checklist ≠ certification | Document as control tracking only |
| Key rotation downtime | Support previous keys during rotation window |
| Test flakiness in CI | Retry policies; isolated test DB/Redis |

---

## 7. Progress tracking

- [ ] Phase 0 — Skeleton
- [ ] Phase 1 — Code quality
- [ ] Phase 2 — CI workflow
- [ ] Phase 3 — CodeQL
- [ ] Phase 4 — Metadata & upgrades
- [ ] Phase 5 — Documentation
- [ ] Phase 6 — Structure & core packages
  - [ ] Phase 6.0 — Project structure
  - [ ] Phase 6.1 — Cross-cutting core packages
  - [ ] Phase 6.2 — Reliability (optional)
- [ ] Phase 7 — User module
  - [ ] Phase 7.0 — Shared enums & types
  - [ ] Phase 7.1 — Data model
  - [ ] Phase 7.2 — Service & API
  - [ ] Phase 7.3 — Tests & docs
- [ ] Phase 8 — Authentication & authorization
  - [ ] Phase 8.0 — Auth module skeleton
  - [ ] Phase 8.1 — Basic JWT auth
  - [ ] Phase 8.2 — OIDC providers
  - [x] Phase 8.3 — Advanced security
  - [ ] Phase 8.4 — Machine-to-machine
  - [ ] Phase 8.5 — Cache-backed auth & notifications
  - [ ] Phase 8.6 — Tests
  - [ ] Phase 8.7 — Session, password history & bot protection
- [ ] Phase 9 — Performance & production hardening
  - [ ] Phase 9.1 — Performance
  - [ ] Phase 9.2 — Production hardening
  - [ ] Phase 9.3 — Email & queue
  - [ ] Phase 9.4 — Testing & docs
  - [ ] Phase 9.5 — User account management & password recovery
  - [ ] Phase 9.6 — Realtime, file storage & API versioning
  - [ ] Phase 9.7 — Observability, seeding & dev tooling
  - [ ] Phase 9.8 — Data lifecycle & caching
  - [ ] Phase 9.9 — Reliability (outbox)
- [ ] Phase 10+ — Enhancement
  - [ ] Phase 10.1 — Query & search
  - [ ] Phase 10.2 — Audit & observability read surface
  - [ ] Phase 10.4 — Compliance & data lifecycle
  - [ ] Phase 10.5 — Integrations & advanced identity
  - [ ] Phase 10.3 — Future enhancements (backlog)
- [ ] Phase 11+ — Optional domain modules
  - [ ] Phase 11.1 — Payments & billing (optional)
  - [ ] Phase 11.2 — Analytics & experimentation (optional)

---
*End of plan.*