import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Piece, SavePieceInput, Settings } from '../src/shared/types'
import { DEFAULT_CUTOUT_OPTIONS } from '../src/core/cutout'
import { DEFAULT_DINOSAUR_STYLE, DEFAULT_THEME, isDinosaurStyle, isThemeId } from '../src/core/theme'
import { DEFAULT_NOTICE_MODE, isNoticeMode } from '../src/core/notices'

const DEFAULT_SETTINGS: Settings = {
  watchFolder: null,
  cutout: DEFAULT_CUTOUT_OPTIONS,
  maxVisible: 50,
  sceneryStrength: 1,
  theme: DEFAULT_THEME,
  dinosaurStyle: DEFAULT_DINOSAUR_STYLE,
  noticeDisplay: DEFAULT_NOTICE_MODE,
  decorDensity: 2,
  swayStrength: 1,
  sizeScale: 1,
}

export function dataRoot(): string {
  return path.join(app.getPath('userData'), 'data')
}

function piecesDir(): string {
  return path.join(dataRoot(), 'pieces')
}

function settingsPath(): string {
  return path.join(dataRoot(), 'settings.json')
}

function indexPath(): string {
  return path.join(dataRoot(), 'pieces.json')
}

/**
 * 書き込みは一時ファイル＋リネームで行う。
 * 会場で電源が落ちたときに JSON が半分だけ書かれた状態になると、
 * 次の起動で全件読めなくなるため（要件定義 §7）。
 */
function writeJsonAtomic(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(payload, null, 2), 'utf8')
  fs.renameSync(temporary, filePath)
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    // 壊れていても起動は止めない。会期中に開かなくなるほうが困る。
    return fallback
  }
}

export function readSettings(): Settings {
  const stored = readJson<Partial<Settings>>(settingsPath(), {})
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    // 設定ファイルを人が触れる形で置いているので、知らない値が入りうる。
    // 落とさず既定に戻す。
    theme: isThemeId(stored.theme) ? stored.theme : DEFAULT_THEME,
    // 知らない値が入っていたら既定に落とす。
    // 前の版で保存した設定ファイルにはこの項目が無い
    dinosaurStyle: isDinosaurStyle(stored.dinosaurStyle)
      ? stored.dinosaurStyle
      : DEFAULT_DINOSAUR_STYLE,
    // 前の版で保存した設定ファイルにはこの項目が無い
    noticeDisplay: isNoticeMode(stored.noticeDisplay) ? stored.noticeDisplay : DEFAULT_NOTICE_MODE,
    cutout: { ...DEFAULT_SETTINGS.cutout, ...stored.cutout },
  }
}

export function writeSettings(patch: Partial<Settings>): Settings {
  const next: Settings = {
    ...readSettings(),
    ...patch,
    cutout: { ...readSettings().cutout, ...patch.cutout },
  }
  writeJsonAtomic(settingsPath(), next)
  return next
}

export function readPieces(): Piece[] {
  return readJson<Piece[]>(indexPath(), [])
}

export function ingestedKeys(): Set<string> {
  return new Set(readPieces().map((piece) => piece.key))
}

export function pieceFile(id: string): string {
  return path.join(piecesDir(), `${id}.png`)
}

export function savePiece(input: SavePieceInput): Piece {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  fs.mkdirSync(piecesDir(), { recursive: true })
  fs.writeFileSync(pieceFile(id), Buffer.from(input.pngBase64, 'base64'))

  const piece: Piece = {
    id,
    key: input.key,
    fileName: input.fileName,
    width: input.width,
    height: input.height,
    createdAt: new Date().toISOString(),
    theme: input.theme,
    rig: input.rig,
    species: input.species,
    head: input.head,
    fit: input.fit,
    built: input.built,
  }

  writeJsonAtomic(indexPath(), [...readPieces(), piece])
  return piece
}

/**
 * すでに保存した絵を、作り直した結果で置き換える（R-062）。
 *
 * 絵そのものが変わったとき（台紙の向きへ起こし直したとき）だけ PNG を書き直す。
 * **同じ id のまま**にするので、泳いでいる絵が入れ替わったようには見えない。
 */
/**
 * 保存してある絵を base64 で返す（作り直しに使う・R-062）。
 *
 * `aqua://` から読むと**キャンバスが汚れて画素を読めなくなる**（別の生い立ち扱い）。
 * ここを通せばそれを避けられる。
 */
export function readPieceImage(id: string): string | null {
  try {
    return fs.readFileSync(pieceFile(id)).toString('base64')
  } catch {
    return null
  }
}

export function updatePiece(
  id: string,
  patch: Partial<Omit<Piece, 'id' | 'key' | 'createdAt'>> & { pngBase64?: string },
): Piece | null {
  const pieces = readPieces()
  const index = pieces.findIndex((piece) => piece.id === id)
  if (index < 0) return null

  const { pngBase64, ...rest } = patch
  if (pngBase64) {
    fs.mkdirSync(piecesDir(), { recursive: true })
    fs.writeFileSync(pieceFile(id), Buffer.from(pngBase64, 'base64'))
  }

  const next = { ...pieces[index], ...rest }
  pieces[index] = next
  writeJsonAtomic(indexPath(), pieces)
  return next
}

export function deletePiece(id: string): void {
  writeJsonAtomic(
    indexPath(),
    readPieces().filter((piece) => piece.id !== id),
  )
  try {
    fs.unlinkSync(pieceFile(id))
  } catch {
    // 画像だけ先に消えていても、台帳から消せていれば実害はない。
  }
}
