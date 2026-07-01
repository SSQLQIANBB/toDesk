import { defineStore } from 'pinia';
import type { PersistenceOptions } from 'pinia-plugin-persistedstate';
import { pinia } from '..';

const persistPrefix = '__STORAGE_PERSIST__';

interface UserState {
  token: string | null;
  refreshToken: string | null;
  userInfo: unknown | null;
  onlineStatus: string | null;
}

const persistOptions: PersistenceOptions<UserState> = {
  storage: localStorage,
  key: persistPrefix,
  pick: ['token', 'refreshToken']
};

const useUserStore = defineStore('user', {
  state: (): UserState => ({
    token: null,
    refreshToken: null,
    userInfo: null,
    onlineStatus: null
  }),
  getters: {
    getToken: (state) => state.token
  },
  persist: persistOptions
});

export default useUserStore;

export function useUserStoreWithOut() {
  return useUserStore(pinia);
}
