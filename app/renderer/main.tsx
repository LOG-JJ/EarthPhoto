import React from 'react';
import ReactDOM from 'react-dom/client';

import './i18n';
import { App } from './App';
import './styles.css';

declare global {
  interface Window {
    __photoGlobeBooted?: boolean;
    __photoGlobeFatalShown?: boolean;
  }
}

interface FatalBoundaryState {
  hasError: boolean;
  detail: string;
}

class FatalBoundary extends React.Component<{ children: React.ReactNode }, FatalBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      detail: '',
    };
  }

  static getDerivedStateFromError(error: unknown): FatalBoundaryState {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    return {
      hasError: true,
      detail,
    };
  }

  componentDidCatch(error: unknown) {
    console.error('[renderer] Fatal render error', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bootstrap-fallback">
          <h2>Renderer Error</h2>
          <p>{this.state.detail || 'Unknown error'}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function formatUnknownError(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function showGlobalFatalOverlay(title: string, detail: string): void {
  const target = document.getElementById('root');
  if (!target) {
    return;
  }
  if (window.__photoGlobeFatalShown) {
    return;
  }
  window.__photoGlobeFatalShown = true;
  target.innerHTML = `
    <div style="display:grid;place-content:center;width:100vw;height:100vh;padding:24px;text-align:center;background:#0b1220;color:#f8fafc;font-family:Segoe UI,system-ui,sans-serif;">
      <div style="max-width:960px;border:1px solid rgba(255,255,255,.22);border-radius:14px;padding:18px;background:rgba(15,23,42,.92)">
        <h2 style="margin:0 0 8px;font-size:22px;">${title}</h2>
        <p style="margin:0;white-space:pre-wrap;line-height:1.4;color:#cbd5e1;">${detail}</p>
      </div>
    </div>
  `;
}

window.addEventListener('error', (event) => {
  const detail = `${event.message} (${event.filename}:${event.lineno}:${event.colno})`;
  console.error('[renderer] window.error', detail);
  showGlobalFatalOverlay('Unexpected Renderer Error', detail);
});

window.addEventListener('unhandledrejection', (event) => {
  const detail = formatUnknownError(event.reason);
  console.error('[renderer] unhandledrejection', detail);
  showGlobalFatalOverlay('Unhandled Promise Rejection', detail);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FatalBoundary>
      <App />
    </FatalBoundary>
  </React.StrictMode>,
);

window.__photoGlobeBooted = true;
