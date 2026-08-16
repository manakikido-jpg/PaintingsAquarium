/**
 * 運営者が見る一覧の並べ方と、一度に出す枚数。
 *
 * 全件を一度に出してはいけない。会期後半には数千枚たまるため、
 * 一覧を開いた瞬間に画像がその数だけ並び、**大画面を映したまま固まる**（R-014）。
 */

/** 一度に出す枚数。「消したい絵」はたいてい直近なので、これで足りる。 */
export const GALLERY_PAGE_SIZE = 60

export interface GalleryPage<T> {
  readonly items: T[]
  /** まだ出していない枚数 */
  readonly remaining: number
  readonly total: number
}

/**
 * 新しい順に `shown` 枚まで返す。
 *
 * 新しい順なのは、消したくなるのが**さっき入った絵**だから。
 * 古い順に出すと、目的の絵にたどり着くまで何度も送ることになる。
 */
export function galleryPage<T>(items: readonly T[], shown: number): GalleryPage<T> {
  const limit = Math.max(0, Math.floor(shown))
  const newestFirst = [...items].reverse()

  return {
    items: newestFirst.slice(0, limit),
    remaining: Math.max(0, items.length - limit),
    total: items.length,
  }
}
