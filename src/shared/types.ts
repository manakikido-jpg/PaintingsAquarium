import type { CutoutOptions } from '../core/cutout'
import type { ThemeId } from '../core/theme'

/** 水槽を泳いでいる絵 1 枚。 */
export interface Piece {
  readonly id: string
  /** 二重取り込みを防ぐための鍵（ファイル名:サイズ） */
  readonly key: string
  readonly fileName: string
  readonly width: number
  readonly height: number
  /** 取り込んだ時刻（ISO 8601） */
  readonly createdAt: string
  /**
   * どのテーマで取り込んだ絵か。そのテーマのときだけ画面に出す。
   * テーマ機能より前の絵には入っていないので、読むときは `themeOf()` を使う。
   */
  readonly theme?: ThemeId
}

export interface Settings {
  /** 見張るフォルダ。未設定なら null */
  readonly watchFolder: string | null
  readonly cutout: CutoutOptions
  /** 同時に泳がせる最大数（要件定義 D-3） */
  readonly maxVisible: number
  /**
   * 背景（光の筋・泡・周辺減光）の強さ。0〜1。
   * 会場の投影機やスクリーンによっては背景が絵より目立つことがあるので、
   * 現場で下げられるようにしてある。0 にすると無地の水色になる。
   */
  readonly sceneryStrength: number
  /** どの世界で見せるか */
  readonly theme: ThemeId
  /**
   * 泳ぐ絵のしなりの強さ。0〜1。0 で完全に止まる（＝以前の見え方に戻る）。
   * 尾びれが振れて見える演出だが、絵1枚あたりの描画命令が増えるので、
   * 会場で重かったら 0 に落とせるようにしてある。
   */
  readonly swayStrength: number
  /**
   * 飾りの多さ。1 で標準。大きいほどサンゴや岩が増える。
   * 増やすほど画面は賑やかになるが、**絵を見つけにくくなる**ので上げすぎない。
   */
  readonly decorDensity: number
}

/** 取り込みフォルダで見つかった、これから処理する写真。 */
export interface IncomingPhoto {
  readonly key: string
  readonly fileName: string
  /** 元写真の data URL。画像処理は画面側（canvas がある側）で行う */
  readonly dataUrl: string
}

export interface SavePieceInput {
  readonly key: string
  readonly fileName: string
  readonly width: number
  readonly height: number
  /** 透過・トリミング済み PNG の base64（data URL の接頭辞なし） */
  readonly pngBase64: string
  readonly theme: ThemeId
}

/** 絵と設定の保存先。別PCへ移すときに運営者がコピーする場所。 */
export interface StorageLocation {
  readonly dataRoot: string
  /** インストールせずに exe をそのまま動かしている（保存先も exe の隣） */
  readonly portable: boolean
}

/** 画面下に出す通知。取り込めなかった理由もここに流す。 */
export interface Notice {
  readonly level: 'info' | 'warn'
  readonly message: string
}

export interface AquariumApi {
  getSettings(): Promise<Settings>
  getStorageLocation(): Promise<StorageLocation>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  chooseWatchFolder(): Promise<Settings>
  listPieces(): Promise<Piece[]>
  savePiece(input: SavePieceInput): Promise<Piece>
  deletePiece(id: string): Promise<void>
  rescan(): Promise<void>
  toggleFullscreen(): Promise<boolean>
  onIncoming(handler: (photo: IncomingPhoto) => void): () => void
  onNotice(handler: (notice: Notice) => void): () => void
}

declare global {
  interface Window {
    aquarium: AquariumApi
  }
}
