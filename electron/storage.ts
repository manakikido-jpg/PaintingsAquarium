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

/**
 * 保存する形式（R-063）。
 *
 * **WebP にすると PNG の 10 分の 1 になる**（実測 498KB → 48KB）。
 * 会期後半に数百枚たまると効いてくる（600枚で 214MB → 28MB）。
 *
 * 非可逆だが、線の上の色のずれは平均 4.8/255 で、
 * **透明と不透明の境目は 1 画素も変わらなかった**（切り抜きの形は保たれる）。
 * 拡大して見比べると、むしろスキャンのノイズが消えて綺麗になる。
 */
export const PIECE_FORMAT = 'webp' as const
export const PIECE_QUALITY = 0.9

/** 書き込む先。新しい絵は WebP で保存する。 */
export function pieceFile(id: string, format: 'png' | 'webp' = PIECE_FORMAT): string {
  return path.join(piecesDir(), `${id}.${format}`)
}

/**
 * 読む先。**古い絵は PNG のまま置いてある**ので、両方を見る。
 * 全部を変換し直すより、次に画面へ出るときに変わればよい（R-062 と同じ考え方）。
 */
export function findPieceFile(id: string): string {
  const webp = pieceFile(id, 'webp')
  return fs.existsSync(webp) ? webp : pieceFile(id, 'png')
}

export function savePiece(input: SavePieceInput): Piece {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  fs.mkdirSync(piecesDir(), { recursive: true })
  fs.writeFileSync(pieceFile(id), Buffer.from(input.imageBase64, 'base64'))

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
    return fs.readFileSync(findPieceFile(id)).toString('base64')
  } catch {
    return null
  }
}

export function updatePiece(
  id: string,
  patch: Partial<Omit<Piece, 'id' | 'key' | 'createdAt'>> & { imageBase64?: string },
): Piece | null {
  const pieces = readPieces()
  const index = pieces.findIndex((piece) => piece.id === id)
  if (index < 0) return null

  const { imageBase64, ...rest } = patch
  if (imageBase64) {
    fs.mkdirSync(piecesDir(), { recursive: true })
    fs.writeFileSync(pieceFile(id), Buffer.from(imageBase64, 'base64'))
    // 作り直したついでに WebP へ移す。古い PNG は置いておかない
    const old = pieceFile(id, 'png')
    if (fs.existsSync(old) && old !== pieceFile(id)) fs.unlinkSync(old)
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
    fs.unlinkSync(findPieceFile(id))
  } catch {
    // 画像だけ先に消えていても、台帳から消せていれば実害はない。
  }
}
