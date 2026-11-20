import { createApp } from 'vue';
import { createPinia } from 'pinia';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import './styles/main.css';
import './styles/board.css';
import App from './App.vue';

createApp(App).use(createPinia()).mount('#app');
