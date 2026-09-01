import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DINOSAUR_STYLE,
  DINOSAUR_STYLES,
  isDinosaurStyle,
  isThemeId,
  themeOf,
} from '../theme'

describe('恐竜テーマの背景の見た目', () => {
  /*
   * **既定は `plain`（いままでの見た目）。**
   * 会場の設定ファイルにはこの項目がまだ無いので、既定が `vivid` だと
   * **アプリを更新した瞬間に、断りなく背景が変わる**。
   */
  it('既定はいままでの見た目', () => {
    expect(DEFAULT_DINOSAUR_STYLE).toBe('plain')
  })

  it('2つとも選べる。名前と説明が空でない', () => {
    expect(DINOSAUR_STYLES.map((style) => style.id)).toEqual(['plain', 'vivid'])
    for (const style of DINOSAUR_STYLES) {
      expect(style.name.length).toBeGreaterThan(0)
      expect(style.note.length).toBeGreaterThan(0)
    }
  })

  /*
   * 前の版で保存した設定ファイルにはこの項目が無い（`undefined`）。
   * ここで弾けないと、知らない値のまま描画側へ渡って背景が出なくなる。
   */
  it('知らない値は受け取らない', () => {
    expect(isDinosaurStyle('plain')).toBe(true)
    expect(isDinosaurStyle('vivid')).toBe(true)
    for (const bad of [undefined, null, '', 'PLAIN', 'flashy', 0, {}]) {
      expect(isDinosaurStyle(bad)).toBe(false)
    }
  })

  /*
   * 背景の見た目は**テーマではない**。テーマを増やすと、絵に記録された
   * テーマと合わなくなって過去の絵が丸ごと消える（`themeOf` の注記）。
   */
  it('テーマとしては扱わない', () => {
    expect(isThemeId('vivid')).toBe(false)
    expect(isThemeId('plain')).toBe(false)
    expect(themeOf({ theme: 'dinosaur' })).toBe('dinosaur')
  })
})
