import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './style/tailwind.css';
import setupStore from '@/stores/index';

const app = createApp(App);

setupStore(app);

app.use(router);
app.mount('#app');
