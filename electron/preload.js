const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  triggerUpdate: () => ipcRenderer.invoke('trigger-update'),
  getUpdateSource: () => ipcRenderer.invoke('get-update-source'),
  chooseUpdateSource: () => ipcRenderer.invoke('choose-update-source'),
  openUpdateSource: () => ipcRenderer.invoke('open-update-source'),
  onUpdateProgress: (cb) => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('update-progress', handler)
    return () => ipcRenderer.removeListener('update-progress', handler)
  },
  ga4Fetch: (args) => ipcRenderer.invoke('ga4-fetch', args),
  ga4FetchPages: (args) => ipcRenderer.invoke('ga4-fetch-pages', args),
  gscFetch: (args) => ipcRenderer.invoke('gsc-fetch', args),
  encryptSecret: (plaintext) => ipcRenderer.invoke('encrypt-secret', plaintext),
  decryptSecret: (ciphertext) => ipcRenderer.invoke('decrypt-secret', ciphertext),
})
