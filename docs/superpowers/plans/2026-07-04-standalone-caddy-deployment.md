# Standalone Caddy Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy ToDesk through Caddy HTTPS without bill while reusing a server-level MySQL and Redis stack safely across future projects.

**Architecture:** A generic infrastructure Compose stack owns MySQL, Redis, their data volumes, and the external `shared-services` network. The ToDesk production stack owns Caddy, Web, backend, uploads, and certificates; only the backend joins the shared network, using a dedicated MySQL database/user and Redis DB.

**Tech Stack:** Docker Compose, Caddy 2, Nginx, Koa, MySQL 8.4, Redis 7.4, GitHub Actions

**User constraint:** Do not create commits. Preserve existing source-code comments.

---

### Task 1: Add deployment contract checks

**Files:**
- Inspect: `docker-compose.prod.yml`
- Inspect: `.env.production.example`

- [ ] **Step 1: Confirm the current configuration fails the new isolation contract**

Run:

```bash
rg -n 'bill-network|BILL_DOCKER_NETWORK' docker-compose.prod.yml .env.production.example
test ! -f Caddyfile
test ! -f docker-compose.infrastructure.yml
```

Expected: bill references are printed and both `test ! -f` checks pass, proving the new files do not exist yet.

- [ ] **Step 2: Record the current Compose service boundary**

Run:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config --services
```

Expected: only `backend` and `web` are listed.

### Task 2: Create the reusable infrastructure stack

**Files:**
- Create: `docker-compose.infrastructure.yml`
- Create: `.env.infrastructure.example`

- [ ] **Step 1: Define shared MySQL and Redis**

Create a Compose file containing:

- MySQL 8.4 with root password, a ToDesk database/user initialized from environment variables, UTF-8 configuration, a health check, and no host port mapping.
- Redis 7.4 with AOF, password authentication, a health check using that password, and no host port mapping.
- Persistent `shared-mysql-data` and `shared-redis-data` volumes.
- A named `shared-services` bridge network and stable `shared-mysql`/`shared-redis` aliases.

- [ ] **Step 2: Add a secret-free infrastructure environment template**

Define `MYSQL_ROOT_PASSWORD`, `INITIAL_DB_NAME`, `INITIAL_DB_USER`,
`INITIAL_DB_PASSWORD`, and `REDIS_PASSWORD` with change-me values.

- [ ] **Step 3: Validate the infrastructure Compose model**

Run:

```bash
docker compose --env-file .env.infrastructure.example -f docker-compose.infrastructure.yml config --quiet
docker compose --env-file .env.infrastructure.example -f docker-compose.infrastructure.yml config --services
```

Expected: validation succeeds and outputs `mysql` and `redis`.

### Task 3: Convert ToDesk production to Caddy and shared services

**Files:**
- Create: `Caddyfile`
- Modify: `docker-compose.prod.yml`
- Modify: `.env.production.example`

- [ ] **Step 1: Add automatic HTTPS configuration**

Create `Caddyfile` with:

```caddyfile
{$DOMAIN} {
    reverse_proxy web:80
}
```

- [ ] **Step 2: Replace the bill network**

Update the production Compose file so:

- backend joins `todesk-internal` and external `shared-services`;
- web only exposes port 80 internally;
- Caddy maps host ports 80 and 443 and joins `todesk-internal`;
- Caddy persists `/data` and `/config`;
- no bill identifiers remain.

- [ ] **Step 3: Make production variables portable**

Update `.env.production.example` with `DOMAIN`, `DB_HOST=shared-mysql`,
`REDIS_HOST=shared-redis`, a dedicated `REDIS_DB=1`, and change-me secret
values. Remove the bill network variable.

- [ ] **Step 4: Validate the application Compose model**

Run:

```bash
docker network inspect shared-services >/dev/null 2>&1 || docker network create shared-services
docker compose --env-file .env.production.example -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production.example -f docker-compose.prod.yml config --services
```

Expected: validation succeeds and outputs `backend`, `web`, and `caddy`.

### Task 4: Stop tracking production secrets

**Files:**
- Modify: `.gitignore`
- Untrack while preserving locally: `.env.production`

- [ ] **Step 1: Ignore real production environment files**

Add `.env.production` and `.env.infrastructure` to `.gitignore` while retaining
the existing example-file exceptions.

- [ ] **Step 2: Remove the tracked production file from the index only**

Run:

```bash
git rm --cached .env.production
test -f .env.production
```

Expected: Git records deletion for a future user-controlled commit, while the
local file remains available and ignored.

- [ ] **Step 3: Verify no real secret file is newly trackable**

Run:

```bash
git check-ignore .env.production .env.infrastructure
```

Expected: both paths are reported as ignored.

### Task 5: Update continuous deployment

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Upload Caddy configuration with Compose**

Export the backend and Web images after pushing them to Docker Hub. Change the
SCP source list to upload both archives, `docker-compose.prod.yml`, and
`Caddyfile` to `/opt/todesk`, then load the archives remotely before starting
the application with remote pulls disabled.

- [ ] **Step 2: Validate shared infrastructure before deployment**

In the remote deployment script, require the `shared-services` network and
verify that `shared-mysql` and `shared-redis` resolve from a temporary container
on that network before starting ToDesk.

- [ ] **Step 3: Replace the obsolete port-8080 health check**

Load `DOMAIN` from `.env.production`, reject an empty value, and poll
`https://${DOMAIN}/` after deployment. On failure, print Compose status and
the recent Caddy/backend logs.

- [ ] **Step 4: Check workflow text for obsolete deployment assumptions**

Run:

```bash
rg -n '8080|bill-network|BILL_DOCKER_NETWORK' .github/workflows/deploy.yml docker-compose.prod.yml .env.production.example
```

Expected: no matches.

### Task 6: Add operator deployment instructions

**Files:**
- Create: `DEPLOYMENT.md`

- [ ] **Step 1: Document first-time shared infrastructure setup**

Include server prerequisites, `/opt/shared-services`, generation of strong
passwords, starting `docker-compose.infrastructure.yml`, and health checks.

- [ ] **Step 2: Document ToDesk and DNS setup**

Include `/opt/todesk/.env.production`, GitHub secrets, A/AAAA changes, ports
22/80/443, deployment trigger, Caddy logs, and HTTPS verification.

- [ ] **Step 3: Document future-project reuse rules**

Require a unique MySQL database/user, a unique Redis DB number, membership of
the external `shared-services` network, and no public database port mappings.

### Task 7: Final verification

**Files:**
- Verify all modified deployment files

- [ ] **Step 1: Validate YAML/Compose interpolation**

Run:

```bash
docker compose --env-file .env.infrastructure.example -f docker-compose.infrastructure.yml config --quiet
docker compose --env-file .env.production.example -f docker-compose.prod.yml config --quiet
```

Expected: both commands exit successfully.

- [ ] **Step 2: Verify dependency removal and secret hygiene**

Run:

```bash
! rg -n 'bill-network|BILL_DOCKER_NETWORK|bill_default' \
  docker-compose.prod.yml docker-compose.infrastructure.yml \
  .env.production.example .env.infrastructure.example \
  .github/workflows/deploy.yml Caddyfile DEPLOYMENT.md
git diff --check
```

Expected: no obsolete bill reference and no whitespace errors.

- [ ] **Step 3: Build existing applications**

Run:

```bash
pnpm --filter backend-koa exec tsc --noEmit
pnpm --filter client-vue build
```

Expected: both existing TypeScript projects compile successfully.

- [ ] **Step 4: Review changes without committing**

Run:

```bash
git status --short
git diff --stat
git diff
```

Expected: only the planned deployment, documentation, ignore, and secret
untracking changes appear. Do not stage other files and do not commit.
