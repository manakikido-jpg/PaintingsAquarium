import { describe, expect, it } from 'vitest'
import { GALLERY_PAGE_SIZE, galleryPage } from '../gallery'

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
