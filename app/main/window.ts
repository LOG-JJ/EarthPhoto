import path from 'node:path';

import * as electronModule from 'electron';
import type { BrowserWindow as BrowserWindowType } from 'electron';

const electron = (electronModule as typeof electronModule & { default?: typeof electronModule }).default ?? electronModule;
const { BrowserWindow, shell } = electron;

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
