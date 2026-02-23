import React from 'react';
import ReactDOM from 'react-dom/client';

import './i18n';
import { App } from './App';
import './styles.css';

declare global {
  interface Window {
    __photoGlobeBooted?: boolean;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

window.__photoGlobeBooted = true;
