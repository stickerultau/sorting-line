const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('spike', {
  hit: (over) => ipcRenderer.send('hit', over),
  state: (state) => ipcRenderer.send('state', state),
})
