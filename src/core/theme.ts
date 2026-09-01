/**
 * テーマ（世界の差し替え）。
 *
 * 取り込みの仕組み（フォルダ監視・白の透過・トリミング）は共通で、
 * 変わるのは「どんな世界で、どう動かすか」だけ。設計は `docs/設計-テーマ.md`。
 */

export type ThemeId = 'aquarium' | 'dinosaur' | 'space' | 'meadow' | 'night'

/**
 * 絵の動き方。
 * - `float` … 自由に浮遊する（水中・宇宙）
 * - `walk` … 地面の上を歩く（恐竜）。奥行きのある列に振り分ける
 * - `flutter` … 舞う（蝶や鳥）。浮遊より上下に大きく揺れる
 * - `rise` … 下から上へ昇る（提灯）。上端を抜けたら下から出直す
 */
export type MotionKind = 'float' | 'walk' | 'flutter' | 'rise'

export interface ThemeMeta {
  readonly id: ThemeId
  readonly name: string
  readonly motion: MotionKind
  /** まだ作っていないテーマは設定画面で選べないようにする */
  readonly ready: boolean
}

export const THEMES: readonly ThemeMeta[] = [
  { id: 'aquarium', name: '水族館', motion: 'float', ready: true },
  { id: 'dinosaur', name: '恐竜', motion: 'walk', ready: true },
  { id: 'space', name: '宇宙', motion: 'float', ready: false },
  { id: 'meadow', name: '森・草原', motion: 'flutter', ready: false },
  { id: 'night', name: '夜空', motion: 'rise', ready: false },
]

export const DEFAULT_THEME: ThemeId = 'aquarium'

/**
 * 恐竜テーマの背景の見た目。
 *
 * **どちらが良いかは会場でしか決められない。** モニタの明るさ、部屋の照明、
 * 来場者との距離で見え方が変わる。片方に決め打ちせず、現地で切り替えられるようにした。
 * `plain` は 2026-08-22 に作ったもので、**そのまま残してある**。
 */
export type DinosaurStyle = 'plain' | 'vivid'

export interface DinosaurStyleMeta {
  readonly id: DinosaurStyle
  readonly name: string
  /** 設定画面に出す一行説明 */
  readonly note: string
}

export const DINOSAUR_STYLES: readonly DinosaurStyleMeta[] = [
  { id: 'plain', name: 'ふつう', note: '青空と砂の地面。絵がいちばん目立つ' },
  { id: 'vivid', name: '派手', note: '朝焼けの空・大きな太陽・火山の光。彩度が高い' },
]

export const DEFAULT_DINOSAUR_STYLE: DinosaurStyle = 'plain'

export function isDinosaurStyle(value: unknown): value is DinosaurStyle {
  return DINOSAUR_STYLES.some((style) => style.id === value)
}

export function themeMeta(id: ThemeId): ThemeMeta {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]
}

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

/**
 * 絵がどのテーマのものか。
 *
 * テーマ機能より前に取り込んだ絵にはテーマが記録されていない。
 * 水族館として扱う。ここで `undefined` を弾くと、過去の絵が
 * どのテーマでも出なくなり、**会期の絵が丸ごと消えたように見える**。
 */
export function themeOf(piece: { theme?: string }): ThemeId {
  return isThemeId(piece.theme) ? piece.theme : DEFAULT_THEME
}
