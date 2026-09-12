import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Piece, SavePieceInput, Settings } from '../src/shared/types'
import { DEFAULT_CUTOUT_OPTIONS } from '../src/core/cutout'
import { DEFAULT_DINOSAUR_STYLE, DEFAULT_THEME, isDinosaurStyle, isThemeId } from '../src/core/theme'
import { DEFAULT_NOTICE_MODE, isNoticeMode } from '../src/core/notices'
import { eventFolderName } from '../src/core/events'
import { SUPPORTED_EXTENSIONS } from '../src/core/ingest'

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

/**
 * 会期ぶんの絵をまとめて別のフォルダへ移し、空から始める（F-513）。
 *
 * **消さずに移す。** 会期中の絵は二度と撮り直せない。
 * `data/events/<日付 名前>/` に `pieces/` と `pieces.json` をそのまま入れるので、
 * 戻したくなったら中身を上の階層へ戻せばよい。
 *
 * **設定（`settings.json`）は動かさない。** 取り込みフォルダもテーマも
 * 次の会期でそのまま使う。ここを一緒に移すと、次の会期の朝に
 * **取り込みフォルダを選び直すところから**になる。
 */
export function archiveEvent(
  name: string,
  /**
   * 取り込みフォルダ。**中の写真も一緒に移す。**
   *
   * 移さないと 2 つ困る。
   * 1. 台帳（`pieces.json`）を移した時点で「取り込み済み」の記録も消えるので、
   *    次の起動で**前の会期の写真がまた取り込まれる**（実機で再現済み）。
   * 2. 元のスキャン写真は、あとから不具合を調べるときの唯一の材料になる。
   *    実際、プテラノドンが飛ばない原因（R-069）は実物の紙が来て初めて分かった。
   */
  watchFolder: string | null,
  now: Date = new Date(),
): { folder: string; pieces: number; scans: number } {
  const pieces = readPieces()
  const eventsRoot = path.join(dataRoot(), 'events')
  fs.mkdirSync(eventsRoot, { recursive: true })

  const folder = eventFolderName(name, now, (candidate) =>
    fs.existsSync(path.join(eventsRoot, candidate)),
  )
  const target = path.join(eventsRoot, folder)
  fs.mkdirSync(target, { recursive: true })

  // 先に絵を移す。台帳だけ先に移すと、途中で落ちたときに
  // 「台帳は空なのに絵は残っている」状態になり、絵の行き先が分からなくなる
  if (fs.existsSync(piecesDir())) {
    fs.renameSync(piecesDir(), path.join(target, 'pieces'))
  }
  if (fs.existsSync(indexPath())) {
    fs.renameSync(indexPath(), path.join(target, 'pieces.json'))
  }
  // 次の会期ぶんの入れ物を作っておく。無くても保存時に作られるが、
  // 運営者がエクスプローラで開いたときに「空になった」と分かるほうがよい
  fs.mkdirSync(piecesDir(), { recursive: true })

  return { folder: target, pieces: pieces.length, scans: moveScans(watchFolder, target) }
}

/**
 * 取り込みフォルダの写真を、会期のフォルダへ移す。
 *
 * **1 枚ずつ試して、失敗しても続ける。** スキャナが書いている途中の
 * ファイルは移せないことがあるが、そこで止めると**残りの写真が
 * 取り込みフォルダに残ったまま**になり、次の会期に混ざる。
 * 移せなかったぶんは数に入れないので、画面の枚数を見れば気づける。
 */
function moveScans(watchFolder: string | null, target: string): number {
  if (!watchFolder || !fs.existsSync(watchFolder)) return 0

  let names: string[]
  try {
    names = fs.readdirSync(watchFolder)
  } catch {
    return 0
  }

  const scans = names.filter((name) =>
    (SUPPORTED_EXTENSIONS as readonly string[]).includes(path.extname(name).toLowerCase()),
  )
  if (scans.length === 0) return 0

  const into = path.join(target, 'scans')
  fs.mkdirSync(into, { recursive: true })

  let moved = 0
  for (const name of scans) {
    try {
      fs.renameSync(path.join(watchFolder, name), path.join(into, name))
      moved++
    } catch {
      /*
       * 別のドライブ（USB のスキャナ用フォルダなど）だと rename が通らない。
       * その場合はコピーしてから消す。コピーが成功した後だけ消すので、
       * 途中で落ちても写真は必ずどちらかに残る。
       */
      try {
        fs.copyFileSync(path.join(watchFolder, name), path.join(into, name))
        fs.unlinkSync(path.join(watchFolder, name))
        moved++
      } catch {
        // 開かれている最中の写真。次の会期に混ざるが、消すよりはよい
      }
    }
  }
  return moved
}
