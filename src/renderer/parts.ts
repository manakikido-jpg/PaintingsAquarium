/**
 * 背景に敷くパーツ画像の一覧。
 *
 * `assets/decor/` に PNG を置き、`tools/split-parts.py` で切り出したあと、
 * ここに並べる。**空のままでも動く**（図形で描く方式に落ちる）。
 *
 * Vite の `import.meta.glob` で集めるので、ファイルを足したら自動で増える。
 * 名前順に並ぶので、`part-01.png` のような連番にしておくこと。
 *
 * **拾うのは `part-*.png` だけ。** `*.png` にしていたら、同じ場所に置いた
 * 切り出し前の一覧画像（2MB）まで背景パーツとして読み込むところだった。
 * 元画像は `assets/decor/source/` に置く。
 */
const found = import.meta.glob('../../assets/decor/part-*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export const DECOR_PARTS: readonly string[] = Object.keys(found)
  .sort()
  .map((key) => found[key])
