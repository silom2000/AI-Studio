const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function() {
  if (arguments[0] === 'electron') return { 
    app: { on: () => {}, whenReady: () => Promise.resolve(), getPath: () => '' },
    ipcMain: { handle: () => {}, on: () => {} },
    BrowserWindow: class { loadFile() {} loadURL() {} on() {} webContents = { send: () => {} } },
    dialog: {},
    shell: {},
    protocol: { registerSchemesAsPrivileged: () => {} },
    nativeTheme: { themeSource: 'system' }
  };
  return originalRequire.apply(this, arguments);
};
require('./electron.cjs');
console.log("Loaded successfully!");
