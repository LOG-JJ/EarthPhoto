import path from 'node:path';

import * as electronModule from 'electron';
import type { BrowserWindow as BrowserWindowType } from 'electron';

const electron = (electronModule as typeof electronModule & { default?: typeof electronModule }).default ?? electronModule;
const { BrowserWindow, shell } = electron;

function createFatalHtml(title: string, detail: string): string {
  const safeTitle = title.replace(/[<>&]/g, '');
  const safeDetail = detail.replace(/[<>&]/g, '');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PhotoGlobeViewer</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b1220;
        color: #f8fafc;
        font-family: "Segoe UI", system-ui, sans-serif;
      }
      article {
        width: min(640px, calc(100vw - 28px));
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(15, 23, 42, .92);
        padding: 18px 20px;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 18px;
      }
      p {
        margin: 0;
        color: #cbd5e1;
        line-height: 1.45;
      }
    </style>
  </head>
  <body>
    <article>
      <h1>${safeTitle}</h1>
      <p>${safeDetail}</p>
    </article>
  </body>
</html>`;
}

export function createMainWindow(): BrowserWindowType {
  const window = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#eaf3ff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
    if (process.env.PHOTOGLOBE_OPEN_DEVTOOLS === '1') {
      window.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    void window.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const channel = level >= 2 ? 'error' : 'log';
    const text = `[renderer:${channel}] ${sourceId}:${line} ${message}`;
    if (channel === 'error') {
      console.error(text);
    } else {
      console.log(text);
    }
  });

  let hasShownFatalPage = false;
  const showFatalPage = (title: string, detail: string) => {
    if (hasShownFatalPage || window.isDestroyed()) {
      return;
    }
    hasShownFatalPage = true;
    const html = createFatalHtml(title, detail);
    void window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    if (!window.isVisible()) {
      window.show();
    }
  };

  window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame) {
      return;
    }
    const detail = `Renderer failed to load. code=${code}, description=${description}, url=${url}`;
    console.error(`[window] ${detail}`);
    showFatalPage('Renderer Load Failed', detail);
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    const detail = `Renderer process terminated. reason=${details.reason}, exitCode=${details.exitCode}`;
    console.error(`[window] ${detail}`);
    showFatalPage('Renderer Process Terminated', detail);
  });

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') {
      return;
    }
    if (input.key === 'F11') {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
      return;
    }
    if (input.key === 'Escape' && window.isFullScreen()) {
      event.preventDefault();
      window.setFullScreen(false);
      return;
    }
    if (input.key === 'Enter' && input.alt) {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    }
  });

  window.once('ready-to-show', () => {
    window.setMenuBarVisibility(false);
    window.maximize();
    window.show();
  });

  return window;
}
