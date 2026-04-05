import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from "virtual:pwa-register";
import App from './App';
import './i18n';
import { installAuthFetchInterceptor } from './utils/auth';
import { ensureNotificationRegistration } from './utils/notifications';
// import './index.css';

installAuthFetchInterceptor();
void ensureNotificationRegistration();

const updateSW = registerSW({
  immediate: true,
  onRegisteredSW: (_swUrl, registration) => {
    registration?.update();
  },
  onNeedRefresh: () => {
    updateSW(true);
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
