import { contextBridge, ipcRenderer } from 'electron'
import type {
  AquariumApi,
  IncomingPhoto,
  Notice,
  SavePieceInput,
  Settings,
  UpdatePiecePatch,
} from '../src/shared/types'

const api: AquariumApi = {
  getSettings: () => ipcRenderer.invoke('aquarium:getSettings'),
  getStorageLocation: () => ipcRenderer.invoke('aquarium:getStorageLocation'),
  updateSettings: (patch: Partial<Settings>) => ipcRenderer.invoke('aquarium:updateSettings', patch),
  chooseWatchFolder: () => ipcRenderer.invoke('aquarium:chooseWatchFolder'),
  listPieces: () => ipcRenderer.invoke('aquarium:listPieces'),
  savePiece: (input: SavePieceInput) => ipcRenderer.invoke('aquarium:savePiece', input),
  readPieceImage: (id: string) => ipcRenderer.invoke('aquarium:readPieceImage', id),
  updatePiece: (id: string, patch: UpdatePiecePatch) =>
    ipcRenderer.invoke('aquarium:updatePiece', id, patch),
  deletePiece: (id: string) => ipcRenderer.invoke('aquarium:deletePiece', id),
  rescan: () => ipcRenderer.invoke('aquarium:rescan'),
  toggleFullscreen: () => ipcRenderer.invoke('aquarium:toggleFullscreen'),
  getVersion: () => ipcRenderer.invoke('aquarium:getVersion'),
  checkForUpdate: () => ipcRenderer.invoke('aquarium:checkForUpdate'),
  installUpdate: () => ipcRenderer.invoke('aquarium:installUpdate'),
  restartAndInstall: () => ipcRenderer.invoke('aquarium:restartAndInstall'),
  pendingUpdate: () => ipcRenderer.invoke('aquarium:pendingUpdate'),

  onIncoming: (handler: (photo: IncomingPhoto) => void) => {
    const listener = (_event: unknown, photo: IncomingPhoto): void => handler(photo)
    ipcRenderer.on('aquarium:incoming', listener)
    return () => ipcRenderer.removeListener('aquarium:incoming', listener)
  },

  onNotice: (handler: (notice: Notice) => void) => {
    const listener = (_event: unknown, notice: Notice): void => handler(notice)
    ipcRenderer.on('aquarium:notice', listener)
    return () => ipcRenderer.removeListener('aquarium:notice', listener)
  },
}

contextBridge.exposeInMainWorld('aquarium', api)
