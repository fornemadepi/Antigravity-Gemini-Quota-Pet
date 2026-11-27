const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  getInitialState: () => ipcRenderer.invoke('pet:get-initial-state'),
  refreshQuota: () => ipcRenderer.invoke('pet:refresh-quota'),
  saveSettings: (partial) => ipcRenderer.invoke('pet:save-settings', partial),
  calibrateQuota: (payload) => ipcRenderer.invoke('pet:calibrate-quota', payload),
  clearCalibration: () => ipcRenderer.invoke('pet:clear-calibration'),
  openSettingsWindow: () => ipcRenderer.send('pet:open-settings'),
  closeSettingsWindow: () => ipcRenderer.send('pet:close-settings'),
  showContextMenu: () => ipcRenderer.send('pet:show-context-menu'),
  setIgnoreMouseEvents: (ignore, opts) =>
    ipcRenderer.send('pet:set-ignore-mouse-events', ignore, opts),
  moveWindowBy: (dx, dy) => ipcRenderer.send('pet:move-window-by', dx, dy),
  finishDrag: () => ipcRenderer.invoke('pet:finish-drag'),
  copyText: (text) => ipcRenderer.invoke('pet:copy-text', text),

  onQuotaUpdated: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('quota-updated', handler);
    return () => ipcRenderer.removeListener('quota-updated', handler);
  },
  onTurnUsage: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('turn-usage', handler);
    return () => ipcRenderer.removeListener('turn-usage', handler);
  },
  onSettingsUpdated: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('settings-updated', handler);
    return () => ipcRenderer.removeListener('settings-updated', handler);
  },
  onTriggerAction: (cb) => {
    const handler = (_, action) => cb(action);
    ipcRenderer.on('trigger-action', handler);
    return () => ipcRenderer.removeListener('trigger-action', handler);
  },
});
