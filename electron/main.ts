import { BrowserWindow, app, dialog, ipcMain, net, protocol } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { decideIngest } from '../src/core/ingest'
import type { IncomingPhoto, Notice, SavePieceInput, Settings } from '../src/shared/types'
import * as storage from './storage'

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

// 保存した絵を <img> から読むための独自スキーム。
// 全件を base64 で画面へ送ると、会期が進むほど起動が重くなるため。
protocol.registerSchemesAsPrivileged([
  { scheme: 'aqua', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

let mainWindow: BrowserWindow | null = null
let watcher: FSWatcher | null = null

function notify(notice: Notice): void {
  mainWindow?.webContents.send('aquarium:notice', notice)
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

function sendPhoto(filePath: string): void {
  const fileName = path.basename(filePath)

  let stats: fs.Stats
  try {
    stats = fs.statSync(filePath)
  } catch {
    // コピーの途中で消えた等。次のイベントで拾えるので黙って諦める。
    return
  }

  const decision = decideIngest({ fileName, sizeBytes: stats.size }, storage.ingestedKeys())
  if (!decision.ingest) {
    // 隠しファイルと取り込み済みは毎回出ると邪魔なので黙らせる。
    if (decision.reason === 'unsupported-extension') {
      notify({ level: 'warn', message: decision.message })
    }
    return
  }

  const mime = MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()]
  if (!mime) return

  try {
    const dataUrl = `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`
    const photo: IncomingPhoto = { key: decision.key, fileName, dataUrl }
    mainWindow?.webContents.send('aquarium:incoming', photo)
  } catch {
    notify({
      level: 'warn',
      message: `${fileName} を読めませんでした。コピーが終わるのを待って、もう一度フォルダに入れ直してください。`,
    })
  }
}

function startWatching(folder: string | null): void {
  void watcher?.close()
  watcher = null
  if (!folder) return

  if (!fs.existsSync(folder)) {
    notify({
      level: 'warn',
      message: `取り込みフォルダ「${folder}」が見つかりません。設定から選び直してください。`,
    })
    return
  }

  watcher = chokidar.watch(folder, {
    depth: 0,
    ignoreInitial: false,
    // コピー中のファイルを掴むと壊れた画像を読むので、
    // サイズが 400ms 変わらなくなるまで待つ。
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
  })

  watcher.on('add', sendPhoto)
  watcher.on('error', (error) => {
    notify({ level: 'warn', message: `フォルダの監視でエラーが起きました: ${String(error)}` })
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#04202f',
    title: 'PaintingsAquarium',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (DEV_SERVER_URL) {
    void mainWindow.loadURL(DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.webContents.once('did-finish-load', () => {
    startWatching(storage.readSettings().watchFolder)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  protocol.handle('aqua', (request) => {
    const id = new URL(request.url).pathname.replace(/^\/+/, '')
    // パス区切りを含む id を弾く。保存フォルダの外を読ませないため。
    if (!/^[a-z0-9-]+$/i.test(id)) return new Response(null, { status: 400 })
    return net.fetch(pathToFileURL(storage.pieceFile(id)).toString())
  })

  ipcMain.handle('aquarium:getSettings', () => storage.readSettings())

  ipcMain.handle('aquarium:updateSettings', (_event, patch: Partial<Settings>) => {
    const next = storage.writeSettings(patch)
    if ('watchFolder' in patch) startWatching(next.watchFolder)
    return next
  })

  ipcMain.handle('aquarium:chooseWatchFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: '写真を入れるフォルダを選んでください',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return storage.readSettings()

    const next = storage.writeSettings({ watchFolder: result.filePaths[0] })
    startWatching(next.watchFolder)
    return next
  })

  ipcMain.handle('aquarium:listPieces', () => storage.readPieces())
  ipcMain.handle('aquarium:savePiece', (_event, input: SavePieceInput) => storage.savePiece(input))
  ipcMain.handle('aquarium:deletePiece', (_event, id: string) => storage.deletePiece(id))
  ipcMain.handle('aquarium:rescan', () => startWatching(storage.readSettings().watchFolder))

  ipcMain.handle('aquarium:toggleFullscreen', () => {
    if (!mainWindow) return false
    const next = !mainWindow.isFullScreen()
    mainWindow.setFullScreen(next)
    return next
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  void watcher?.close()
  if (process.platform !== 'darwin') app.quit()
})
