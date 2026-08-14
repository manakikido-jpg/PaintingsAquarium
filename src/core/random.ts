/**
 * 種から作る擬似乱数。`Math.random` を使わないのは、
 * 泳ぎ方・歩き方・背景の配置をテストで再現できるようにするため。
 *
 * 素直な線形合同法（`state = state * 1664525 + 1013904223`）を、
 * 種をそのまま初期値にして使うと**近い種どうしで最初の 1 回の出目がほぼ同じ**になる。
 * 実際、連続した 60 個の種から列を選んだところ **8 列のうち 2 列にしか散らなかった**（R-008）。
 *
 * ここでは種を先によく混ぜ、1 回ごとの出目も混ぜる（mulberry32）。
 * 「1 個の値としては乱数に見えるが、種を 1 ずつ変えると似た値が出る」
 * という罠を避けるため。
 */
export function seededRandom(seed: number): () => number {
  let state = (seed ^ 0x9e3779b9) >>> 0
  state = Math.imul(state ^ (state >>> 16), 0x21f0aaad) >>> 0
  state = Math.imul(state ^ (state >>> 15), 0x735a2d97) >>> 0
  state = (state ^ (state >>> 15)) >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
