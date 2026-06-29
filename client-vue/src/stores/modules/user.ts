import { defineStore } from 'pinia';
import { pinia } from '..';

const persistPrefix = '__STORAGE_PERSIST__'

const useUserStore = defineStore('user', {
  state: () => ({
    token: null,
    refreshToken: null,
    userInfo: null,
    onlineStatus: null
  }),
  getters: {
    getToken: () => {}
  }
}, {
  persist: {
    storage: localStorage,
    key: persistPrefix,
    pick: ['token', 'refreshToken']
  }
})

export default useUserStore

export function useUserStoreWithOut() {
  const store = useUserStore(pinia);

  return store;
}