/**
 * 外周から辿って「外側」を求める。**切れ目は塞いでから辿る。**
 *
 * 紙を消すとき（`cutout.ts`）も、照合の形を作るとき（`outline.ts`）も、
 * やっていることは同じ「外周から通れる所を辿る」。
 * 通ってよい画素の決め方だけが違う（紙らしいか／線でないか）。
 *
 * **切れ目を塞ぐ手当ても両方に要る（R-057）。**
 * 台紙の線が印刷のかすれ・スキャン・消しゴムで途切れていると、
 * そこから中へ入り込む。紙を消すほうでは**中の白が食われ**、
 * 照合のほうでは**絵の形が線だけに痩せて台紙に当たらなくなる**。
 * 片方だけ直しても、絵は出るのに種類が付かない（＝動きが台紙の正解にならない）。
 */

/** 通れる範囲を `steps` 画素ぶん痩せさせる（縦横に分けて数える）。 */
export function shrinkMask(
  mask: Uint8Array,
  width: number,
  height: number,
  steps: number,
): Uint8Array {
  const total = width * height
  let current = mask
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(total)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        if (current[index] === 0) continue
        let keep = 1
        for (let step = 1; step <= steps && keep === 1; step++) {
          const a = pass === 0 ? x - step : y - step
          const b = pass === 0 ? x + step : y + step
          const limit = pass === 0 ? width : height
          const before = a < 0 ? -1 : pass === 0 ? y * width + a : a * width + x
          const after = b >= limit ? -1 : pass === 0 ? y * width + b : b * width + x
          // 画像の外は通れるものとみなす。端まで痩せさせない
          if (before >= 0 && current[before] === 0) keep = 0
          if (after >= 0 && current[after] === 0) keep = 0
        }
        next[index] = keep
      }
    }
    current = next
  }
  return current
}

/**
 * 外周から `mask` を辿って届いた所に 1 を立てて返す。
 *
 * `seal` が 0 より大きいときは、**痩せさせてから辿り、辿り終えてから
 * 同じ幅だけ太らせて戻す**（`mask` の上だけ）。
 * こうすると、開いていた所は元どおり外側になり、
 * 切れ目から入り込んだ分だけが外側にならずに残る。
 */
export function floodFromBorder(
  mask: Uint8Array,
  width: number,
  height: number,
  seal = 0,
): Uint8Array {
  const total = width * height
  const outside = new Uint8Array(total)
  if (total === 0) return outside

  const passable = seal > 0 ? shrinkMask(mask, width, height, seal) : mask

  const stack = new Int32Array(total)
  let stackSize = 0
  const push = (index: number): void => {
    if (outside[index] === 1 || passable[index] === 0) return
    outside[index] = 1
    stack[stackSize++] = index
  }

  for (let x = 0; x < width; x++) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    push(y * width)
    push(y * width + width - 1)
  }

  while (stackSize > 0) {
    const index = stack[--stackSize]
    const x = index % width
    const y = (index - x) / width
    if (x > 0) push(index - 1)
    if (x < width - 1) push(index + 1)
    if (y > 0) push(index - width)
    if (y < height - 1) push(index + width)
  }

  // 痩せさせたぶんを戻す。**通れる画素の上だけ**に広げるので、絵の中へは入らない
  for (let step = 0; step < seal && passable !== mask; step++) {
    const grown: number[] = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        if (outside[index] === 1 || mask[index] === 0) continue
        const touching =
          (x > 0 && outside[index - 1] === 1) ||
          (x < width - 1 && outside[index + 1] === 1) ||
          (y > 0 && outside[index - width] === 1) ||
          (y < height - 1 && outside[index + width] === 1)
        if (touching) grown.push(index)
      }
    }
    if (grown.length === 0) break
    for (const index of grown) outside[index] = 1
  }

  return outside
}

/**
 * 塞ぐ幅を画素数に直す。割合で持つのは、絵の大きさが変わっても同じ効きにするため。
 *
 * **小さい画像では 0 になる。** 取り込む絵は長辺 1200px 前後で、
 * 数画素痩せさせても影響が無い。数十画素の画像で同じことをすると
 * 全体が丸ごと痩せて何も消えなくなる（単体テストの絵がそれ）。
 */
export function sealSteps(width: number, height: number, ratio: number): number {
  return Math.floor(Math.min(width, height) * ratio)
}
