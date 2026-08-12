/**
 * 取り込んだ絵が水槽に現れるときの演出。
 *
 * いきなり出すと、来場者から見ると「今までいなかったものが唐突に湧いた」に見える。
 * ゆっくり濃くなりながら少し大きくなることで、水の奥から泳いで来たように見せる。
 */

/** 現れきるまでの秒数。長すぎると取り込みが遅れているように見える。 */
export const APPEAR_DURATION_SECONDS = 1.4

/**
 * 現れる進み具合。0（まだ見えない）〜1（現れきった）。
 *
 * 最後だけゆっくり止まる曲線にしている。等速だと、現れ終わる瞬間に
 * 動きがぱたりと止まって見え、かえって不自然になる。
 */
export function appearProgress(
  ageSeconds: number,
  duration = APPEAR_DURATION_SECONDS,
): number {
  if (duration <= 0) return 1
  const t = Math.min(1, Math.max(0, ageSeconds / duration))
  return 1 - Math.pow(1 - t, 3)
}

/** 濃さ。0 で透明、1 でそのまま。 */
export function appearAlpha(progress: number): number {
  return Math.min(1, Math.max(0, progress))
}

/**
 * 大きさの倍率。0.7 倍から始めて等倍で止まる。
 * 1 より大きくして跳ねさせる（オーバーシュート）ことはしない。
 * 水槽全体が静かな動きなので、そこだけ弾むと浮く。
 */
export function appearScale(progress: number): number {
  const eased = Math.min(1, Math.max(0, progress))
  return 0.7 + 0.3 * eased
}

/**
 * この絵は演出をつけて出すべきか。
 *
 * アプリを起動する前から保存されていた絵まで演出すると、起動のたびに
 * 全部が一斉にふわっと出て、不具合のように見える。
 * 起動後に取り込まれた絵だけを新入りとして扱う。
 */
export function isNewlyArrived(createdAtIso: string, appStartedAtMs: number): boolean {
  const createdAt = Date.parse(createdAtIso)
  if (Number.isNaN(createdAt)) return false
  return createdAt >= appStartedAtMs
}
