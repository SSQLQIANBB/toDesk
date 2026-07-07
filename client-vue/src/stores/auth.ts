import { defineStore } from 'pinia';
import type { PersistenceOptions } from 'pinia-plugin-persistedstate';
import type { LocationQueryRaw } from 'vue-router';
import {
  getCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  type LoginParams,
  type User,
} from '@/api/auth';

type LogoutOptions = {
  callApi?: boolean;
  redirect?: string;
  navigate?: boolean;
};

type CredentialLoginResult = {
  accessToken: string;
  refreshToken: string;
  user: User;
  message: string;
};

interface AuthState {
  currentUser: User | null;
  token: string | null;
  refreshToken: string | null;
}

const persistPrefix = '__STORAGE_PERSIST_AUTH_';

const persistOptions: PersistenceOptions<AuthState> = {
  storage: localStorage,
  key: persistPrefix,
  pick: ['token', 'refreshToken'],
};

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    currentUser: null,
    token: null,
    refreshToken: null,
  }),

  getters: {
    isAuthenticated: state => !!state.token,
  },

  actions: {

    setAuth(user: User, authToken: string, authRefreshToken?: string) {
      this.currentUser = user;
      this.token = authToken;

      if (authRefreshToken) {
        this.refreshToken = authRefreshToken;
      }
    },

    updateToken(newAccessToken: string, newRefreshToken?: string) {
      this.token = newAccessToken;

      if (newRefreshToken) {
        this.refreshToken = newRefreshToken;
      }
    },

    clearAuthLocal() {
      this.currentUser = null;
      this.token = null;
      this.refreshToken = null;
    },

    async fetchCurrentUser() {
      const { user } = await getCurrentUser({ skipAuthRedirect: true });
      this.currentUser = user;
      return user;
    },

    async login(credentials?: LoginParams): Promise<CredentialLoginResult | { user: User }> {
      if (credentials) {
        const result = await apiLogin(credentials);
        this.setAuth(result.user, result.accessToken, result.refreshToken);
        return result;
      }

      const user = await this.fetchCurrentUser();
      return { user };
    },

    async logout(options: LogoutOptions = {}) {
      const { callApi = true, navigate = false, redirect } = options;
      const hadToken = !!this.token;

      if (callApi && hadToken) {
        try {
          await apiLogout();
        } catch (error) {
          console.error('Logout request failed:', error);
        }
      }

      this.clearAuthLocal();

      if (navigate) {
        const { default: router } = await import('@/router');
        const query: LocationQueryRaw = redirect ? { redirect } : {};
        await router.replace({ name: 'Login', query });
      }
    },

    async clearAuth() {
      await this.logout({ callApi: true });
    },

    updateUserInfo(user: Partial<User>) {
      if (this.currentUser) {
        this.currentUser = { ...this.currentUser, ...user };
      }
    },

    restoreUser(user: User) {
      this.currentUser = user;
    },
  },

  persist: persistOptions,
});
