import { describe, expect, it } from 'vitest'
import { GALLERY_PAGE_SIZE, galleryPage, needsRebuild } from '../gallery'

const many = Array.from({ length: 2000 }, (_, index) => index)

describe('galleryPage', () => {
  it('新しい順に並ぶ（消したいのは直近の絵）', () => {
    expect(galleryPage([1, 2, 3], 3).items).toEqual([3, 2, 1])
  })

  it('指定した枚数を超えて返さない', () => {
    expect(galleryPage(many, GALLERY_PAGE_SIZE).items).toHaveLength(GALLERY_PAGE_SIZE)
  })

  /** これが本題。2000枚あっても、一度に描くのは 60 枚まで（R-014）。 */
  it('会期後半の枚数でも、一度に出す数が増えない', () => {
    const page = galleryPage(many, GALLERY_PAGE_SIZE)

    expect(page.items.length).toBe(GALLERY_PAGE_SIZE)
    expect(page.total).toBe(2000)
    expect(page.remaining).toBe(2000 - GALLERY_PAGE_SIZE)
  })

  it('残り枚数が分かる', () => {
    expect(galleryPage(many, 100).remaining).toBe(1900)
  })

  it('全部出しても残りは 0（負にならない）', () => {
    expect(galleryPage([1, 2, 3], 999).remaining).toBe(0)
  })

  it('0 枚でも落ちない', () => {
    expect(galleryPage([], GALLERY_PAGE_SIZE)).toEqual({ items: [], remaining: 0, total: 0 })
  })

  it('元の配列を書き換えない', () => {
    const source = [1, 2, 3]
    galleryPage(source, 3)
    expect(source).toEqual([1, 2, 3])
  })
})

describe('needsRebuild', () => {
  /*
   * **見分け方を直しても、前に取り込んだ絵は古いまま泳ぎ続ける（R-062）。**
   * 実際、向きがばらつく不具合を直したあとも、直す前のサメは逆を向いたままだった。
   */
  it('版が古い絵と、版が入っていない絵を選ぶ', () => {
    const list = [{ built: 1 }, { built: 0 }, {}, { built: 2 }]
    expect(needsRebuild(list, 2)).toEqual([{ built: 1 }, { built: 0 }, {}])
  })

  it('全部が新しければ何も選ばない', () => {
    expect(needsRebuild([{ built: 3 }, { built: 3 }], 3)).toEqual([])
  })

  /*
   * **渡すのは画面に出ている絵だけ。** 全件を渡すと会期後半で起動が遅くなる。
   * ここは「渡されたものだけを見る」ことを固定しておく。
   */
  it('渡された分より多くは選ばない', () => {
    const shown = [{ built: 0 }, { built: 0 }]
    expect(needsRebuild(shown, 1)).toHaveLength(2)
  })
})
