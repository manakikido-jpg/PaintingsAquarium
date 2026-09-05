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

/**
 * **作り直しが要る絵を選ぶ（R-062）。**
 *
 * 種類・頭の向き・動き方は取り込んだときに一度だけ決めて保存している。
 * 見分け方を直しても、前に取り込んだ絵は古いまま泳ぎ続ける。
 *
 * **渡すのは「いま画面に出ている絵」だけにすること。**
 * 会期後半には数百枚たまるので、全部を作り直すと起動が遅くなる。
 * 出ていない絵は、出る番が来たときに直る。
 *
 * 版が入っていない絵（この仕組みより前に取り込んだもの）は 0 とみなす。
 */
export function needsRebuild<T extends { readonly built?: number }>(
  visible: readonly T[],
  version: number,
): T[] {
  return visible.filter((piece) => (piece.built ?? 0) < version)
}
