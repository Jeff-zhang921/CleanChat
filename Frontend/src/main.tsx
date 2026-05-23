import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './i18n';
import { getAuthToken, installAuthFetchInterceptor } from './utils/auth';
// import './index.css';

installAuthFetchInterceptor();

const runWhenIdle = (task: () => void) => {
  if (typeof window === "undefined") {
    task();
    return;
  }

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(task, { timeout: 5000 });
    return;
  }

  globalThis.setTimeout(task, 1200);
};

runWhenIdle(() => {
  if (getAuthToken()) {
    void import("./utils/notifications").then(({ ensureNotificationRegistration }) =>
      ensureNotificationRegistration(),
    );
  }

  void import("virtual:pwa-register").then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onRegisteredSW: (_swUrl, registration) => {
        registration?.update();
      },
      onNeedRefresh: () => {
        updateSW(true);
      },
    });
  });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
