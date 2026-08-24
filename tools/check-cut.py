#!/usr/bin/env python3
"""
台紙が「切って動かせる絵か」を測る。

    python3 tools/check-cut.py <台紙のPNG> [...]

**動かしたいと思ったら、実装より先にこれを通すこと。**

プテラノドンの翼を動かそうとして、切る位置をいくら探しても見つからなかった。
あとから測ったら、一番すいている縦線でも**絵の高さの 29%** を横切っていた。
四足恐竜の足元には**まったく横切らない線**があったので切れたのに、
その違いを測らずに実装へ進んで時間を使った（R-039）。

見るのは3つ。

1. **切れる線があるか** — 縦・横それぞれで、絵を一番横切らない線がどれだけ横切るか。
   0% なら、そこで切っても裂けない。10% を超えるなら、その方向には切れない。
2. **塗る場所が残っているか** — 線の内側の白の**合計**が絵全体の何割か。
   ほかの台紙は 31〜52%。**12% まで落ちると塗り絵として成立しない**（R-038）。

   **一番大きい区画の広さで判断しないこと。** 区画が細かく分かれている絵は
   一番大きい区画が小さくなるが、塗る場所が減ったわけではない（むしろ
   塗り分けやすい）。実際、この道具の最初の版は「一番大きい区画」で見ていて、
   良い台紙（合計 31%・最大 12%）を「狭すぎる」と誤って落とした。
3. **輪郭が閉じているか** — 内側の面積 ÷ 線の面積。2.0 未満は線が切れている疑い。
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

# 線とみなす暗さ
INK = 140
# 絵の内側とみなすのに、外から届く白を塗りつぶす目印
OUTSIDE = 128
# 切る線として使える上限（絵をこれ以上横切るなら、その方向には切れない）
CUT_LIMIT = 0.10
# 塗れる面積（合計）の下限。ほかの台紙は 0.31〜0.52
PAINT_LIMIT = 0.22


def load(path, side=800):
    """余白を詰めた白黒。取り込んだ絵と同じ状態にして測る。"""
    grey = Image.open(path).convert('L')
    ink = grey.point(lambda v: 255 if v < INK else 0)
    box = ink.getbbox()
    if box is None:
        return None, None, 0, 0
    grey = grey.crop(box)
    grey.thumbnail((side, side))
    width, height = grey.size
    ink = grey.point(lambda v: 255 if v < INK else 0, mode='1')

    # 外から届く白を塗る → 残りが絵の内側
    flood = Image.new('L', (width + 2, height + 2), 0)
    flood.paste(ink.convert('L'), (1, 1))
    ImageDraw.floodfill(flood, (0, 0), OUTSIDE)
    filled = np.asarray(flood)[1 : height + 1, 1 : width + 1] != OUTSIDE
    return filled, np.asarray(ink), width, height


def regions(filled, ink):
    """塗れる区画（線の内側の白）を大きい順に返す。割合は絵の外接矩形に対する値。"""
    from scipy import ndimage

    white = filled & ~ink.astype(bool)
    labels, count = ndimage.label(white)
    if count == 0:
        return []
    sizes = ndimage.sum(white, labels, range(1, count + 1))
    total = filled.shape[0] * filled.shape[1]
    return sorted((size / total for size in sizes), reverse=True)


def paint_total(filled, ink):
    """線の内側の白の合計。**塗れる場所の量はこちらで見る。**"""
    white = filled & ~ink.astype(bool)
    return white.sum() / (filled.shape[0] * filled.shape[1])


def best_cuts(filled):
    """帯ごとに、一番すいている切り目を探す。

    **絵の端から端までの線だけを見てはいけない。** 恐竜の足は「足元の帯の中だけ」で
    切っているので、全体で見ると横切って見えても、帯の中では 0% になる。
    実際、この道具の最初の版は全体しか見ておらず、
    切れているアンキロサウルスまで「切れない」と報告した。

    縦の切り目は横帯（上から4等分）ごとに、横の切り目は縦帯ごとに測る。
    """
    height, width = filled.shape
    out = []

    def enough(part):
        """切り目の両側に絵があるか。

        片側が空っぽの線は 0% になるが、**何も分けていない**。
        絵の外の余白を「切れる」と報告してしまうので、両側を見る。
        """
        return part.sum() >= part.size * 0.02

    for index in range(4):
        y0, y1 = int(height * index / 4), int(height * (index + 1) / 4)
        band = filled[y0:y1, :]
        columns = [
            (x / width, band[:, x].sum() / max(1, y1 - y0))
            for x in range(int(width * 0.15), int(width * 0.85))
            if enough(band[:, :x]) and enough(band[:, x:])
        ]
        label = f'{index / 4:.2f}〜{(index + 1) / 4:.2f} の帯'
        out.append(('縦', label, *(min(columns, key=lambda c: c[1]) if columns else (float('nan'), float('nan')))))
    for index in range(4):
        x0, x1 = int(width * index / 4), int(width * (index + 1) / 4)
        band = filled[:, x0:x1]
        rows = [
            (y / height, band[y, :].sum() / max(1, x1 - x0))
            for y in range(int(height * 0.15), int(height * 0.85))
            if enough(band[:y, :]) and enough(band[y:, :])
        ]
        label = f'{index / 4:.2f}〜{(index + 1) / 4:.2f} の帯'
        out.append(('横', label, *(min(rows, key=lambda r: r[1]) if rows else (float('nan'), float('nan')))))
    return out


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    worst = 0
    for name in sys.argv[1:]:
        path = Path(name)
        filled, ink, width, height = load(path)
        if filled is None:
            print(f'{path.name}: 絵が見つからない')
            worst = 1
            continue

        cuts = best_cuts(filled)
        paint = regions(filled, ink)
        total_paint = paint_total(filled, ink)
        closed = filled.sum() / max(1, ink.sum())

        print(f'\n{path.name}  {width}x{height}  比 {width / height:.2f} : 1')
        print(f'  輪郭      内側/線 = {closed:.1f}' + ('' if closed >= 2.0 else '   ← 線が切れている疑い'))
        print(
            f'  塗れる面積 合計 {total_paint * 100:.0f}%（一番大きい区画 {paint[0] * 100:.0f}%）'
            + ('' if total_paint >= PAINT_LIMIT else f'   ← 狭すぎる（{PAINT_LIMIT * 100:.0f}% 以上ほしい）')
        )
        usable = [cut for cut in cuts if cut[3] <= CUT_LIMIT]
        import math

        for way, band, at, cross in cuts:
            axis = 'x' if way == '縦' else 'y'
            if math.isnan(cross):
                print(f'  {way}に切る  {band}  分けられる場所が無い（片側が空）')
                continue
            mark = '  ← ここで切れる' if cross <= CUT_LIMIT else ''
            print(f'  {way}に切る  {band}  {axis}={at:.2f}  {cross * 100:3.0f}% を横切る{mark}')
        if not usable:
            print('  → **この絵は切れない。** 手足だけを動かすことはできない')

        if closed < 2.0 or total_paint < PAINT_LIMIT:
            worst = 1

    print('\n※ 切れなくても台紙としては使える（動かさなければよい）。')
    print('　 塗る場所が狭い・輪郭が切れている場合だけ、作り直しになる。')
    return worst


if __name__ == '__main__':
    raise SystemExit(main())
