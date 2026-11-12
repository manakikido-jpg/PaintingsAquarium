/** 上空の小さな装飾だけを動かし、草地と入口の看板を空ける。座標は画面の割合。 */
export interface SkySprite {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly alpha: number
}

const CLOUDS = [
  { left: 0.40, right: 0.70, y: 0.070, width: 0.14, seconds: 180, phase: 0.28 },
  { left: 0.40, right: 0.76, y: 0.095, width: 0.10, seconds: 220, phase: 0.62 },
  { left: 0.35, right: 0.50, y: 0.190, width: 0.10, seconds: 160, phase: 0.44 },
] as const

/** 位置が一周して戻る瞬間は完全に透明にして、画面内の瞬間移動を見せない。 */
function sweep(elapsed: number, seconds: number, phase: number): { progress: number; alpha: number } {
  const progress = ((Math.max(0, elapsed) / seconds + phase) % 1 + 1) % 1
  const edge = Math.min(1, progress / 0.15, (1 - progress) / 0.15)
  return { progress, alpha: edge * edge * (3 - 2 * edge) }
}

export function zooClouds(elapsed: number): readonly SkySprite[] {
  return CLOUDS.map(cloud => {
    const { progress, alpha } = sweep(elapsed, cloud.seconds, cloud.phase)
    return { x: cloud.left + (cloud.right - cloud.left) * progress,
      y: cloud.y, width: cloud.width, alpha: alpha * 0.58 }
  })
}

export function zooBirds(elapsed: number, decorDensity = 1): readonly (SkySprite & { wing: number; direction: number })[] {
  const count = decorDensity <= 0 ? 0 : decorDensity < 0.8 ? 2 : 3
  return Array.from({ length: count }, (_, i) => {
    const direction = i === 1 ? -1 : 1
    const { progress, alpha } = sweep(elapsed, [34, 41, 37][i], [0.08, 0.48, 0.78][i])
    return {
      x: 0.33 + 0.48 * (direction === 1 ? progress : 1 - progress),
      y: [0.080, 0.125, 0.105][i] + Math.sin(elapsed * 0.55 + i * 2) * 0.003,
      width: [0.015, 0.012, 0.010][i], alpha: alpha * 0.78, direction,
      wing: Math.sin(elapsed * (8.5 + i) + i * 2.1),
    }
  })
}
