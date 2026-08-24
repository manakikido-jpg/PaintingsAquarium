#!/usr/bin/env python3
"""台紙を、印刷できる大きさに仕上げる。

    python3 tools/finish-templates.py assets/templates

`tools/prep-templates.py` の**次**に通す。順番は

    生成した画像 → prep-templates.py（外枠とラベルを落とす）
                 → finish-templates.py（これ・印刷できる大きさにする）
                 → make-template-data.py（アプリが読む升目データ）

なぜ要るのか
------------
もらった台紙は長辺 376〜500px しかなかった。**A4に伸ばすと6倍**になるので、
線のギザギザが 0.7mm の階段になって見える。塗り絵の台紙としては使えない。

ただの拡大では直らない。**階段が大きな階段になるだけ**だから。
そこで、線の輪郭を**曲線として取り出してから**大きく描き直す。

やっていること
--------------
1. 白黒に分ける（`INK` より暗い所が線）
2. 線の境目を、画素の間を通る**閉じた曲線**として取り出す（marching squares）
3. その曲線を、線に沿ってならす（`SMOOTH`）。**画素の階段だけが消えて、形は残る**
4. 曲線を塗って描き直す。**内と外は「重なった回数の偶奇」で決める**
   （線の内側の白は、外側の曲線と内側の曲線に2回囲まれているので白に戻る）
5. 2倍の大きさで描いてから縮める。境目がなめらかになる（印刷で黒が締まる）

**元の絵より綺麗になるわけではない。** 画素の階段が消えるだけで、
もともとの線の揺れはそのまま残る（手描きの線として自然に見える）。
線画をもっと綺麗にしたいなら、生成のやり直しが要る。

形を直す（`SHAPE`）
-------------------
印刷の都合とは別に、**形が似すぎている台紙をここで離す**。
いまはクラゲだけ。理由は下の表に書いてある。

**同じ絵に2回かけても変わらない**ようにしてある（もう目標の比なら何もしない）。
通す順番を間違えても壊れないように。
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage import measure

# 線とみなす暗さ。`src/core/match.ts` と `tools/check-templates.py` に合わせる
INK = 140
# 仕上がりの長辺（画素）。A4 の実寸で 300dpi 相当を少し超える
LONG_EDGE = 2400
# 線に沿ってならす強さ（元の画像の画素で）。
# 1.2 くらいが、階段は消えて目や歯のような小さい形は残る境目
SMOOTH = 1.2
# 描くときの倍率。2倍で描いて縮めると境目がなめらかになる
OVERSAMPLE = 2

# 形を直す台紙。
#   ratio  … 目標の「高さ ÷ 幅」
#   cut    … 引き伸ばし始める高さ（絵の上端からの割合）
#   why    … なぜ直すのか
SHAPE = {
    '06_kurage': dict(
        ratio=2.0,
        cut=0.42,
        why='まる魚との重なりが 0.55 で、見分けの差が +0.00 だった。'
        '照合は回転を全部試すので、効くのは「長辺と短辺の比」。'
        '触手を下へ伸ばして 2:1 の縦長にすると、丸いまる魚から離れる',
    ),
}


def ink_mask(path):
    grey = np.asarray(Image.open(path).convert('L'), dtype=np.float32)
    return grey < INK


def stretch_below(mask, ratio, cut):
    """絵の下のほうだけを縦に引き伸ばす関数を作る。

    **絵全体を引き伸ばさない。** かさ（クラゲの頭）まで縦長になると別の生き物に見える。
    引き伸ばすのは切り目より下だけで、そこは触手が**ほぼ真下に向かって**いる。
    真下に向かう線を縦に伸ばしても、線の太さ（横で測る）は変わらないし、
    形も「触手が長くなった」ようにしか見えない。
    プテラノドンの翼と同じ考え方で、**回さずに伸ばすと絵が裂けない**。

    すでに目標の比より縦長なら、何もしない関数を返す（2回かけても変わらない）。
    """
    rows = np.where(mask.any(axis=1))[0]
    columns = np.where(mask.any(axis=0))[0]
    top, bottom = int(rows[0]), int(rows[-1])
    art_height, art_width = bottom - top, int(columns[-1] - columns[0])
    want = ratio * art_width
    if art_height >= want:
        return None, 0.0

    cut_at = top + art_height * cut
    room = bottom - cut_at
    factor = 1 + (want - art_height) / room

    def warp(y):
        below = np.maximum(0.0, np.minimum(y, bottom) - cut_at)
        return y + below * (factor - 1)

    return warp, factor


def smooth_closed(points, sigma):
    """閉じた曲線に沿ってならす。端は反対の端につなげる（`mode='wrap'`）。

    普通にならすと**端だけが内側へ寄って、線が食い違う**。
    閉じた線なので、端は隣り合っている。
    """
    out = np.empty_like(points)
    for axis in (0, 1):
        out[:, axis] = ndimage.gaussian_filter1d(points[:, axis], sigma, mode='wrap')
    return out


def redraw(mask, long_edge, warp=None):
    height, width = mask.shape
    out_height = float(warp(height - 1) + 1) if warp else float(height)
    scale = long_edge * OVERSAMPLE / max(out_height, width)
    canvas_w = int(round(width * scale))
    canvas_h = int(round(out_height * scale))

    # 画像の外周を1画素ぶん空けてから境目を探す。
    # 絵が端に接していると、そこだけ線が開いた形で取り出されてしまう
    padded = np.pad(mask.astype(np.float32), 1)
    filled = np.zeros((canvas_h, canvas_w), dtype=bool)
    for contour in measure.find_contours(padded, 0.5):
        # 数点しかない輪郭は、取り込みのゴミ（1〜2画素の点）。塗ると黒い粒が残る
        if len(contour) < 8:
            continue
        contour = smooth_closed(contour, SMOOTH)
        ys = contour[:, 0] - 1
        xs = contour[:, 1] - 1
        if warp:
            ys = warp(ys)
        shape = Image.new('1', (canvas_w, canvas_h), 0)
        ImageDraw.Draw(shape).polygon(list(zip(xs * scale, ys * scale)), fill=1)
        # **重なった回数の偶奇で決める。** 線の内側の白は輪郭に2回囲まれているので、
        # 2回反転して白へ戻る。外側と内側を判定する必要がない
        filled ^= np.asarray(shape, dtype=bool)

    image = Image.fromarray(np.where(filled, 0, 255).astype(np.uint8))
    return image.resize((canvas_w // OVERSAMPLE, canvas_h // OVERSAMPLE), Image.LANCZOS)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    root = Path(sys.argv[1])
    files = sorted(p for p in root.rglob('*.png') if 'source' not in p.parts)
    if not files:
        print(f'台紙が見つからない: {root}')
        return 1

    for path in files:
        mask = ink_mask(path)
        before = Image.open(path).size
        plan = SHAPE.get(path.stem)
        warp, factor = (None, 0.0)
        if plan:
            warp, factor = stretch_below(mask, plan['ratio'], plan['cut'])
        image = redraw(mask, LONG_EDGE, warp)
        image.save(path)
        note = ''
        if plan:
            note = f'  形も直した（下を {factor:.2f} 倍に伸ばした）' if warp else '  形はもう目標どおり'
        print(f'{path.relative_to(root)}  {before[0]}x{before[1]} → {image.width}x{image.height}{note}')

    print('\n次にやること:')
    print('  python3 tools/check-templates.py assets/templates      # 見分けが通るか')
    print('  python3 tools/make-template-data.py assets/templates src/core/templates.generated.ts')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
