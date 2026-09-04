import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTICE_MODE,
  NOTICE_MODES,
  isNoticeMode,
  showsNotice,
  type NoticeMode,
} from '../notices'

describe('左下のお知らせをどこまで出すか', () => {
  /*
   * **既定を変えない。** 更新した瞬間に断りなく画面から文字が消えると
   * 「壊れた」と見える。会期前に設定画面で選んでもらう。
   */
  it('既定はいままでどおり全部出す', () => {
    expect(DEFAULT_NOTICE_MODE).toBe('all')
    expect(showsNotice(DEFAULT_NOTICE_MODE, 'info')).toBe(true)
    expect(showsNotice(DEFAULT_NOTICE_MODE, 'warn')).toBe(true)
  })

  /*
   * **「失敗だけ」で warn を消さない。** ここが消えると、
   * 紙が1枚取り込めなかったことに誰も気づけない。
   */
  it('「失敗だけ」は、失敗を必ず残して知らせだけ消す', () => {
    expect(showsNotice('warn', 'warn')).toBe(true)
    expect(showsNotice('warn', 'info')).toBe(false)
  })

  it('「出さない」は何も出さない', () => {
    expect(showsNotice('none', 'warn')).toBe(false)
    expect(showsNotice('none', 'info')).toBe(false)
  })

  it('3つとも選べる。名前と説明が空でない', () => {
    expect(NOTICE_MODES.map((mode) => mode.id)).toEqual(['all', 'warn', 'none'])
    for (const mode of NOTICE_MODES) {
      expect(mode.name.length).toBeGreaterThan(0)
      expect(mode.note.length).toBeGreaterThan(0)
    }
  })

  /*
   * 前の版で保存した設定ファイルにはこの項目が無い（`undefined`）。
   * ここで弾けないと、知らない値のまま描画側へ渡って何も出なくなる。
   */
  it('知らない値は受け取らない', () => {
    for (const good of ['all', 'warn', 'none'] as NoticeMode[]) {
      expect(isNoticeMode(good)).toBe(true)
    }
    for (const bad of [undefined, null, '', 'ALL', 'info', 'hidden', 0, {}]) {
      expect(isNoticeMode(bad)).toBe(false)
    }
  })
})
