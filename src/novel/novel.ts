import { createApp } from 'vue'
import App from './novel.vue'
import { ipcRenderer } from 'electron';
import axios from 'axios';

// 如果你想使用 Node.js，那么需要在主进程中启用 nodeIntegration。

// const response = await axios.get("https://www.youtube.com/");
// console.log(response.data)

async function initApp() {
    const publicPath = await ipcRenderer.invoke('get-public-path');
    const app = createApp(App);
    app.provide('publicPath', publicPath);
    app.mount('#app');
}
initApp();
