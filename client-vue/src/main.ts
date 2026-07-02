import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { useAuth } from './stores/auth';
import './style/tailwind.css';
import setupStore from '@/stores/index';

const app = createApp(App);

setupStore(app);

const { initAuth } = useAuth();
initAuth();

app.use(router);
app.mount('#app');
