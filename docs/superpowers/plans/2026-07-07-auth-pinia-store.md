# Auth Pinia Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move auth state and login/logout behavior into a single Pinia auth store without persisting `currentUser` in localStorage.

**Architecture:** `client-vue/src/stores/auth.ts` becomes a Pinia setup store and keeps the existing `useAuth()` compatibility API. Route guards call store actions for session restore and logout. Login UI delegates API login to the store action.

**Tech Stack:** Vue 3, Pinia, Vue Router, Vitest, TypeScript.

## Global Constraints

- Do not persist `currentUser` or `user` to localStorage.
- Keep `token` and `refreshToken` persistence compatible with existing keys.
- Keep current `useAuth()` consumers working unless a local call site must be adjusted.
- Do not introduce new dependencies.

---

### Task 1: Convert auth state to Pinia store

**Files:**
- Modify: `client-vue/src/stores/auth.ts`
- Modify: `client-vue/src/stores/modules/user.ts`

**Interfaces:**
- Produces: `useAuthStore`, `useAuth`, `login(credentials?: LoginParams)`, `logout(options?: LogoutOptions)`, `fetchCurrentUser()`, `setAuth(user, token, refreshToken?)`, `updateToken(accessToken, refreshToken?)`, `clearAuthLocal()`, `updateUserInfo(user)`.

- [ ] Replace module-level refs in `auth.ts` with `defineStore('auth', () => ...)`.
- [ ] Keep localStorage reads/writes only for `token` and `refreshToken`.
- [ ] Remove all localStorage reads/writes for `user` or `currentUser`.
- [ ] Merge `stores/modules/user.ts` auth state into a compatibility re-export of the auth store.

### Task 2: Move login/logout flows into store actions

**Files:**
- Modify: `client-vue/src/stores/auth.ts`
- Modify: `client-vue/src/services/loginController.ts`
- Modify: `client-vue/src/views/login.vue`

**Interfaces:**
- Consumes: `login(credentials?: LoginParams)` from auth store.
- Produces: login page calls one store action to authenticate and navigate after success.

- [ ] Add credential login path in auth store action using `apiLogin`.
- [ ] Add no-argument login path in auth store action using `getCurrentUser`.
- [ ] Add logout action using `apiLogout`, local cleanup, and optional router navigation.
- [ ] Change login controller dependency from raw API login + `setAuth` to store `login`.
- [ ] Change registration success to use `setAuth` without persisting user.

### Task 3: Simplify route guard around token/currentUser

**Files:**
- Modify: `client-vue/src/router/index.ts`

**Interfaces:**
- Consumes: `auth.login()` for current-user restore and `auth.logout()` for cleanup/redirect.

- [ ] Let `/login` pass directly.
- [ ] If a protected route lacks token, call logout action and redirect to login.
- [ ] If token exists and currentUser is empty, call `auth.login()` to fetch `/api/auth/me`.
- [ ] On fetch failure, call logout action and redirect to login.

### Task 4: Align request 401 handling and consumers

**Files:**
- Modify: `client-vue/src/utils/request.ts`
- Modify: `client-vue/src/stores/socket.ts`
- Modify: `client-vue/src/views/profile.vue`
- Modify: `client-vue/src/views/remoteShare/index.vue`

**Interfaces:**
- Consumes: auth store `logout` and `clearAuthLocal`.

- [ ] Make refresh use auth store token state instead of raw localStorage where possible.
- [ ] Route 401 failure through `logout({ callApi: false, redirect })`.
- [ ] Update explicit logout callers to use the store action.

### Task 5: Update tests and verify

**Files:**
- Modify: `client-vue/src/services/loginController.test.ts`
- Modify: `client-vue/src/views/login.test.ts`
- Modify: `client-vue/src/utils/request.test.ts`

**Interfaces:**
- Tests verify no localStorage user persistence, login action delegation, refresh retry, and 401 logout redirect.

- [ ] Update test mocks for `login` action instead of `setAuth` where relevant.
- [ ] Run `pnpm.cmd --dir client-vue test`.
- [ ] Run `pnpm.cmd --dir client-vue typecheck`.
