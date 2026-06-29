import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
// import { useAuth } from './stores/auth'
import './style/tailwind.css'
import setupStore from '@/stores/index'

// // 初始化认证状态
// const { initAuth } = useAuth();
// initAuth();

const app = createApp(App);

setupStore(app);

app.use(router);
app.mount('#app')
