// THROWAWAY spike: does a transparent, always-on-top, click-through strip work in Electron?
const { app, BrowserWindow, ipcMain, screen } = require('electron')
const fs = require('fs')
const path = require('path')

const STRIP_HEIGHT = 220
const args = process.argv.join(' ')
const exitAfterMs = Number((args.match(/--exit-after=(\d+)/) || [])[1] || 120) * 1000
const stateFile = path.join(app.isPackaged ? path.dirname(process.execPath) : __dirname, 'state.json')

function steamTest() {
  // Public test app 480. Unlock one achievement, read it back, then restore the previous state.
  try {
    const client = require('steamworks.js').init(480)
    const name = 'ACH_WIN_ONE_GAME'
    const before = client.achievement.isActivated(name)
    const activated = client.achievement.activate(name)
    const after = client.achievement.isActivated(name)
    if (!before) client.achievement.clear(name)
    return { ran: true, before, activated, after, restored: !before }
  } catch (error) {
    return { ran: false, error: String(error && error.message ? error.message : error) }
  }
}

app.whenReady().then(() => {
  const area = screen.getPrimaryDisplay().workArea
  const win = new BrowserWindow({
    x: area.x,
    y: area.y + area.height - STRIP_HEIGHT,
    width: area.width,
    height: STRIP_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true, { forward: true })
  win.loadFile('index.html', { query: { dpr: (args.match(/--dpr=([0-9.]+)/) || [])[1] || '' } })
  // Finding: the call above, made before the page loads, does not stick. Repeat it once loaded.
  win.webContents.once('did-finish-load', () => win.setIgnoreMouseEvents(true, { forward: true }))

  const steam = args.includes('--steam-test') ? steamTest() : { ran: false, error: 'not requested' }

  ipcMain.on('hit', (_event, over) => win.setIgnoreMouseEvents(!over, { forward: true }))
  ipcMain.on('state', (_event, state) => {
    const record = {
      ...state,
      bounds: win.getBounds(),
      alwaysOnTop: win.isAlwaysOnTop(),
      packaged: app.isPackaged,
      electron: process.versions.electron,
      steam,
    }
    fs.writeFile(stateFile, JSON.stringify(record, null, 2), () => {})
  })

  setTimeout(() => app.quit(), exitAfterMs)
})

app.on('window-all-closed', () => app.quit())
