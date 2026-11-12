/** 低FPSでも登場と退出が引き延ばされないよう、物理の刻みと実時間を分ける。 */
export function frameTiming(previousMs: number, nowMs: number): { deltaSeconds: number; wallSeconds: number } {
  return {
    // 復帰時に生き物が壁まで飛ばないよう、移動の1ステップだけを制限する。
    deltaSeconds: Math.min(0.05, Math.max(0, (nowMs - previousMs) / 1000)),
    wallSeconds: nowMs / 1000,
  }
}

export const MAX_EXIT_AGE_SECONDS = 20

/** 退出できない絵を残し続けると描画負荷をさらに増やすため、実時間で打ち切る。 */
export function exitExpired(ageSeconds: number): boolean {
  return ageSeconds >= MAX_EXIT_AGE_SECONDS
}
