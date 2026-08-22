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

/*
 * 恐竜テーマのパーツ。水族館と違い、**種類ごとに置き場所が違う**
 *（岩は奥の地面、草は手前、火山は遠景）ので、1つの一覧にまとめずに分ける。
 * 名前は `tools/prep-dino-parts.py` が付ける。
 *
 * `import.meta.glob` の引数は**その場に書いた値**でないと Vite が解析できない。
 * まとめようとして変数に入れると、ビルドは通るのに中身が空になる。
 */
const collect = (files: Record<string, string>): readonly string[] =>
  Object.keys(files)
    .sort()
    .map((key) => files[key])

export const DINO_ROCKS: readonly string[] = collect(
  import.meta.glob('../../assets/decor/dinosaur/rock-*.png', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
)
export const DINO_TREES: readonly string[] = collect(
  import.meta.glob('../../assets/decor/dinosaur/tree-*.png', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
)
export const DINO_PLANTS: readonly string[] = collect(
  import.meta.glob('../../assets/decor/dinosaur/plant-*.png', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
)
export const DINO_VOLCANOES: readonly string[] = collect(
  import.meta.glob('../../assets/decor/dinosaur/volcano-*.png', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
)
export const DINO_FINDS: readonly string[] = collect(
  import.meta.glob('../../assets/decor/dinosaur/find-*.png', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
)
