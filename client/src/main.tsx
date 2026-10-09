import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

/**
 * 路由前缀 = Vite 的 base（末尾去掉斜杠）。
 * 部署在子目录（如 /test/）时，BrowserRouter 必须知道前缀，
 * 否则链接会跳到域名根目录。
 */
const basename = import.meta.env.BASE_URL.replace(/\/+$/, '');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename || undefined}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
