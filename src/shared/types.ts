import type { CutoutOptions } from '../core/cutout'
import type { DinosaurStyle, ThemeId } from '../core/theme'
import type { NoticeMode } from '../core/notices'
import type { Rig } from '../core/rig'
import type { Direction, SpeciesId } from '../core/templates'

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
  /**
   * 体の芯と尾びれの位置。取り込み時に一度だけ求めて保存する。
   * 動くたびに測り直さないのは、毎フレームやると成立しないため
   *（`docs/設計-AI.md`）。古い絵には入っていない。
   */
  readonly rig?: Rig
  /**
   * どの台紙の絵か。台紙に一致しなかった絵（自由に描いた絵）には入らない。
   * 種類ごとの動きに使う（`docs/設計-生き物ごとの動き.md`）。
   */
  readonly species?: SpeciesId
  /**
   * 絵の中で頭が向いている向き（台紙に一致した絵だけ）。
   * 上から見た生き物を、進む向きへ回して描くために使う。
   */
  readonly head?: Direction
  /**
   * 台紙に合わせるために、絵を何回まわしたか・左右反転したか。
   * 台紙に書いた手足の位置を、絵の中の位置に直すのに使う。
   */
  readonly fit?: { readonly turns: number; readonly mirrored: boolean }
  /**
   * どの版の見分け方で作った絵か（R-062）。
   *
   * 種類・頭の向き・動き方は**取り込んだときに一度だけ**決めて保存している。
   * 見分け方を直しても、**前に取り込んだ絵は古いまま泳ぎ続ける**。
   * 実際、向きがばらつく不具合を直したあとも、直す前に取り込んだサメは
   * 逆を向いたままだった。
   *
   * ここが `RIG_VERSION` より古い絵は、**画面に出るものだけ**あとから作り直す。
   * 入っていない絵は 0 とみなす。
   */
  readonly built?: number
}

/**
 * 見分け方の版。**変えたら上げる。**
 *
 * 上げると、画面に出ている絵が起動後に静かに作り直される。
 * 全部を作り直さないのは、会期の後半で 600枚 を抱えても
 * 起動が遅くならないようにするため（実測: 600枚でも起動 5.8秒で 60枚と変わらない）。
 *
 * - 1: 台紙との照合を2つの形で試し、向き直しが入れた左右反転を戻す版
 *      （F-365 / F-366 / R-058・R-061）
 */
export const RIG_VERSION = 1

/** 作り直した結果を書き戻すときに渡すもの。 */
export type UpdatePiecePatch = Partial<
  Pick<Piece, 'rig' | 'species' | 'head' | 'fit' | 'width' | 'height' | 'built'>
> & { imageBase64?: string }

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
   * 恐竜テーマの背景の見た目。`plain`（ふつう）か `vivid`（派手）。
   * 会場の明るさで見え方が変わるので、現場で切り替えられるようにしてある。
   * 水族館テーマでは使わない。
   */
  readonly dinosaurStyle: DinosaurStyle
  /**
   * 左下のお知らせをどこまで出すか。
   * 会期中の画面は来場者が見ているので絞れるようにしてあるが、
   * `none` にすると**取り込めなかったことに気づけなくなる**。
   */
  readonly noticeDisplay: NoticeMode
  /**
   * 絵の大きさの倍率。1 で標準（画面幅の 7%）。0.5〜2。
   * 会場の画面の大きさと、来場者との距離で見え方が変わるので現場で決める。
   * 上げすぎると絵どうしが重なって自分の絵を見つけにくくなる。
   */
  readonly sizeScale: number
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
  /** 透過・トリミング済みの絵の base64（data URL の接頭辞なし・形式は `PIECE_FORMAT`） */
  readonly imageBase64: string
  readonly theme: ThemeId
  readonly rig?: Rig
  readonly species?: SpeciesId
  readonly head?: Direction
  readonly fit?: { readonly turns: number; readonly mirrored: boolean }
  /** どの版の見分け方で作ったか（`RIG_VERSION`） */
  readonly built?: number
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

/**
 * 更新の確認結果。
 *
 * **押したときだけ**通信する（設定画面の「更新を確認」）。
 * 起動時には見に行かない。会期中はネットにつながっていなくてよい
 *（`docs/要件定義.md` §4）。
 */
export type UpdateStatus =
  | { readonly kind: 'latest'; readonly version: string }
  | { readonly kind: 'available'; readonly version: string }
  | { readonly kind: 'downloaded'; readonly version: string }
  /** 入れ替えの画面を出したところ。このあとアプリは終了する */
  | { readonly kind: 'installing'; readonly version: string }
  | { readonly kind: 'portable'; readonly message: string }
  | { readonly kind: 'unavailable'; readonly message: string }

export interface AquariumApi {
  getSettings(): Promise<Settings>
  getStorageLocation(): Promise<StorageLocation>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  chooseWatchFolder(): Promise<Settings>
  listPieces(): Promise<Piece[]>
  savePiece(input: SavePieceInput): Promise<Piece>
  /** 保存してある絵を base64 で返す（作り直しに使う） */
  readPieceImage(id: string): Promise<string | null>
  /** 作り直した結果で置き換える（R-062）。絵が変わったときだけ `imageBase64` を渡す */
  updatePiece(id: string, patch: UpdatePiecePatch): Promise<Piece | null>
  deletePiece(id: string): Promise<void>
  rescan(): Promise<void>
  toggleFullscreen(): Promise<boolean>
  /** いまの版（`0.1.38` のような番号）。配布したファイル名には入れていない */
  getVersion(): Promise<string>
  /** 新しい版があるか見に行く。押したときだけ通信する */
  checkForUpdate(): Promise<UpdateStatus>
  /** 新しい版を落とす。**落としただけでは入れ替わらない** */
  installUpdate(): Promise<UpdateStatus>
  /** いま入れ替えて再起動する（入れ替えの画面が出る） */
  restartAndInstall(): Promise<UpdateStatus>
  /** 落とし終えて、まだ入れ替えていない版。無ければ null */
  pendingUpdate(): Promise<string | null>
  onIncoming(handler: (photo: IncomingPhoto) => void): () => void
  onNotice(handler: (notice: Notice) => void): () => void
}

declare global {
  interface Window {
    aquarium: AquariumApi
  }
}
