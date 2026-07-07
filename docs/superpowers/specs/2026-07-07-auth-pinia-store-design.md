# Auth Pinia Store Design

## Goal

认证状态统一由 Pinia store 管理，移除本地持久化 `currentUser`，并把登录、登出、获取当前用户的流程集中到 store action。

## Architecture

`client-vue/src/stores/auth.ts` 作为唯一认证状态入口，使用 `defineStore('auth')` 管理 `token`、`refreshToken` 和 `currentUser`。`token` 与 `refreshToken` 可以保存在 `localStorage`，`currentUser` 只保存在运行时内存中；页面刷新后如果存在 token 且缺少用户信息，由路由守卫调用 store action 请求 `/api/auth/me`。

`client-vue/src/stores/modules/user.ts` 不再承担认证职责，避免 auth store 与 user store 双源状态。现有 `useAuth()` 调用保留为兼容入口，内部返回 Pinia auth store，减少页面级改动。

## Route Guard Flow

- 访问 `/login` 时直接放行。
- 访问需要鉴权的路由且没有 token 时，调用 auth store 的 logout action 清理状态并跳转登录页。
- 有 token 但没有 `currentUser` 时，调用 auth store 的 login action 拉取当前用户信息。
- 拉取失败时调用 logout action 清理状态并跳转登录页。

## Store Actions

- `login(credentials)`：有参数时执行账号密码登录并保存 token；无参数时通过 `/api/auth/me` 获取当前用户。
- `logout(options)`：可选调用后端登出接口，清理本地 token/refreshToken/currentUser，并可跳转登录页。
- `setAuth`、`updateToken`、`updateUserInfo`：保留兼容 API，但不再写入用户信息到 localStorage。

## Testing

更新登录控制器和请求层测试，使它们验证登录 action、token 刷新、401 清理与跳转行为。最终运行前端单测和类型检查。
