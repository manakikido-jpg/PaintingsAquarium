/**
 * 泳ぐ絵をしならせる計算。
 *
 * 絵を縦の帯に切り、**進む向きの後ろ側ほど大きく**上下にずらすと、
 * 本物の魚のように尾が振れて見える。背びれ・尾びれを見分けて動かしているのではなく、
 * 「後ろほど大きく振れる」という魚の泳ぎ方そのものを絵全体に当てている。
 *
 * ここを AI（部位の検出）でやろうとしないのには理由がある。
 * - 子どもの絵に背びれがあるとは限らない。四角も虹もロボットも来る
 * - 検出できても、外したときに絵が壊れて見える（何も動かないほうがまし）
 * - 推論のために外部通信か GPU が要り、完全オフラインの前提が壊れる（要件定義 §4）
 *
 * 頭と尾の判定は「進む向きの側が頭」。描画側が進行方向に合わせて絵を左右反転
 * しているので、**絵の右が頭・左が尾**として扱えばよく、新しい仮定を増やさない。
 */

export interface UndulateOptions {
  /** 尾での最大の振れ幅。絵の高さに対する割合 */
  readonly amplitude: number
  /** 波長。絵の長さ（頭から尾）に対する割合。1 なら体に波がちょうど1つ乗る */
  readonly waveLength: number
  /** 1秒あたりに波が進む回数 */
  readonly speed: number
  /** 頭側のここまでは動かさない。0.35 なら頭から35%は固定 */
  readonly headHold: number
}

export const DEFAULT_UNDULATE: UndulateOptions = {
  // 高さの14%。これ以上にすると魚ではなく「ちぎれた紙」に見えはじめる
  amplitude: 0.14,
  waveLength: 1.15,
  speed: 1.1,
  // 頭がぶれると絵が水中で溺れているように見える。頭は止めるのが自然に見える鍵
  headHold: 0.34,
}

const TAU = Math.PI * 2

/**
 * 帯の位置（0=頭側の端, 1=尾側の端）を返す。帯の中心で測る。
 * 端ではなく中心を使うのは、`strips` を増減しても見え方が変わらないようにするため。
 */
export function stripRatio(index: number, strips: number): number {
  return (index + 0.5) / strips
}

/**
 * 頭からの位置に対する振れ幅の重み（0〜1）。
 *
 * 単なる直線ではなく2乗にしている。直線だと体の真ん中がよく動き、
 * **胴体から折れているように見える**。実際の魚は尾の近くだけが大きく振れる。
 */
export function tailWeight(ratio: number, headHold: number): number {
  if (ratio <= headHold) return 0
  const past = (ratio - headHold) / (1 - headHold)
  return past * past
}

/**
 * 帯の縦のずれ。絵の高さに対する割合で返す（描画側で高さを掛ける）。
 *
 * `phase` は絵ごとにずらす値。これが無いと全部の絵が同じ拍で振れて、
 * 群れではなく1つの機械に見える。
 */
export function stripOffset(
  ratio: number,
  timeSeconds: number,
  phase: number,
  options: UndulateOptions = DEFAULT_UNDULATE,
): number {
  const weight = tailWeight(ratio, options.headHold)
  if (weight === 0) return 0
  const wave = Math.sin((ratio / options.waveLength) * TAU - timeSeconds * options.speed * TAU + phase)
  return wave * options.amplitude * weight
}

/**
 * 絵ごとの拍のばらつき。0.85〜1.15 倍。
 * 全部を同じ速さで振らせると、群れが1枚の布のように揃って見える。
 */
export function beatRate(seed: number): number {
  // seed は整数。下位ビットだけだと隣り合う id で同じ値になるので、混ぜてから使う
  const mixed = Math.abs(Math.sin(seed * 12.9898) * 43758.5453)
  return 0.85 + (mixed - Math.floor(mixed)) * 0.3
}

/** 絵ごとの位相。0〜2π */
export function beatPhase(seed: number): number {
  const mixed = Math.abs(Math.sin(seed * 78.233) * 24634.6345)
  return (mixed - Math.floor(mixed)) * TAU
}

/**
 * 帯の数。細かいほどなめらかだが、そのぶん描画命令が増える。
 *
 * 絵1枚あたり `strips` 回 `drawImage` を呼ぶことになるので、
 * 50匹なら 50×strips 回／フレーム。**ここは実測で決める数字**（R-012 / R-016）。
 */
export function stripCount(strength: number): number {
  if (strength <= 0) return 1
  /*
   * 8 本。帯ごとに縦の傾きを掛けて隣とつなぐので、粗くしても段差は出ない。
   *
   * 実測（50匹・1280×800・ソフトウェア描画）:
   *   14本: しなり無 23.9fps → 有 19.4fps（-19%）
   *    8本: しなり無 24.5fps → 有 22.7fps（-7%）
   * 8本の画面を見て faceting が出ていないことを確認したうえで 8 にした。
   * 段差が出るのは「平行移動だけ」で並べたときで、本数の問題ではなかった。
   */
  return 8
}

/* ------------------------------------------------------------------
 * 尾びれの振れ
 *
 * 胴体の波とは別に、尾びれは**付け根を軸に回る**。
 * 胴と同じように平行移動させるだけだと、しなってはいても
 * 「ひれが動いている」とは見えない。
 * ------------------------------------------------------------------ */

/** 尾びれの最大の振れ角（ラジアン）。約 30 度。 */
export const TAIL_MAX_ANGLE = 0.52

/**
 * 尾びれの角度。正なら尾の先が下がる向き。
 *
 * 胴の波より **4分の1周期だけ遅れる**。
 * 実際の魚は、体をくねらせた力が遅れて尾に伝わる。
 * 同じ位相で振ると、体と尾が一枚の板のように動いて硬く見える。
 */
export function tailAngle(
  fromRatio: number,
  timeSeconds: number,
  phase: number,
  sway: number,
  options: UndulateOptions = DEFAULT_UNDULATE,
): number {
  if (sway <= 0) return 0
  const weight = tailWeight(fromRatio, options.headHold)
  const wave = Math.sin(
    (fromRatio / options.waveLength) * TAU - timeSeconds * options.speed * TAU + phase - Math.PI / 2,
  )
  return wave * TAIL_MAX_ANGLE * weight * Math.min(1, Math.max(0, sway))
}

/**
 * 頭からの割合を、絵の中の横位置（0=左, 1=右）に直す。
 *
 * 絵は頭が右に描かれているとは限らない（実物は縦向きだった）。
 * リグが持っている `headsRight` で読み替える。
 */
export function headRatioToImageX(fromHead: number, headsRight: boolean): number {
  return headsRight ? 1 - fromHead : fromHead
}

/** 背びれ・腹びれの最大の振れ角（ラジアン）。約 12 度。 */
export const FIN_MAX_ANGLE = 0.21

/**
 * 背びれ・腹びれの角度。
 *
 * 尾びれよりずっと小さく振る。実際の魚も、背びれは進む向きを保つための
 * ひれで、尾のように打ち振るものではない。
 * 大きく振ると、ひれが体から外れて別の生き物が付いているように見える。
 *
 * 位相を体の位置でずらすのは、複数のひれが同時に同じ方向へ動くと
 * **絵全体が波打っているようにしか見えない**ため。
 */
export function finAngle(
  centreRatio: number,
  timeSeconds: number,
  phase: number,
  sway: number,
  options: UndulateOptions = DEFAULT_UNDULATE,
): number {
  if (sway <= 0) return 0
  const wave = Math.sin(
    (centreRatio / options.waveLength) * TAU - timeSeconds * options.speed * TAU + phase,
  )
  return wave * FIN_MAX_ANGLE * Math.min(1, Math.max(0, sway))
}
