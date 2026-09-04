/**
 * 左下に出すお知らせを、どこまで出すか。
 *
 * **単純な「出す／出さない」にはしない。**
 * ここに流れるものには2種類ある。
 *
 * | 種類 | 例 | 誰のためか |
 * |---|---|---|
 * | `info` | 「台紙の向きに合わせて起こしました」 | 開発と下見。会期中は要らない |
 * | `warn` | 「絵が残りませんでした」「紙の端まで写っています」 | **スタッフ。取り込めなかったと分かる唯一の手段** |
 *
 * 会期中の画面は**来場者が見ている**ので、`info` は邪魔なだけ。
 * かといって全部消すと、**紙が1枚泳がなかったことに誰も気づけない**。
 * だから3択にしてある。
 */

export type NoticeMode = 'all' | 'warn' | 'none'

export interface NoticeModeMeta {
  readonly id: NoticeMode
  readonly name: string
  /** 設定画面に出す一行説明 */
  readonly note: string
}

export const NOTICE_MODES: readonly NoticeModeMeta[] = [
  { id: 'all', name: 'ぜんぶ出す', note: '向きを直したことなども出ます。下見のとき向き' },
  {
    id: 'warn',
    name: '失敗だけ',
    note: '取り込めなかったときだけ出ます。**会期中はこれ**',
  },
  { id: 'none', name: '出さない', note: '画面に何も出ません。取り込めなかったことにも気づけません' },
]

/**
 * 既定は「ぜんぶ出す」。
 *
 * **既定を変えない。** 更新した瞬間に、断りなく画面から文字が消えると
 * 「壊れた」と見える。会期前に設定画面で選んでもらう（`docs/リハーサル手順.md`）。
 */
export const DEFAULT_NOTICE_MODE: NoticeMode = 'all'

export function isNoticeMode(value: unknown): value is NoticeMode {
  return NOTICE_MODES.some((mode) => mode.id === value)
}

/** そのお知らせを出すか。 */
export function showsNotice(mode: NoticeMode, level: 'info' | 'warn'): boolean {
  if (mode === 'none') return false
  if (mode === 'warn') return level === 'warn'
  return true
}
