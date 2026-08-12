import type { CutoutOptions } from '../core/cutout'

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
}

/** 画面下に出す通知。取り込めなかった理由もここに流す。 */
export interface Notice {
  readonly level: 'info' | 'warn'
  readonly message: string
}

export interface AquariumApi {
  getSettings(): Promise<Settings>
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
