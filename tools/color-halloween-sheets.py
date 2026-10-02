#!/usr/bin/env python3
"""ハロウィンの台紙に「子どもが塗った」色を入れた見本を作る。

**何のためにあるか** — 企画書と画面写真のため。線画のままの絵が漂っている画面では、
会場で何が起きるのかが伝わらない。実際に会場で塗られた紙が手に入るまでの代わり。

**本物らしく見せるために3つ入れてある。**

1. **区画ごとに別の色。** 線で囲まれた区画を数え上げ、広いものから順に色を割り当てる。
   1色でべた塗りすると塗り絵に見えない。
2. **クレヨンの粗さ。** 一様に塗ると印刷物に見えるので、斜めの筋と濃淡を掛ける。
3. **はみ出しと塗り残し。** 塗る面を少しずらし、ところどころ白を残す。
   **ここを省くと、切り抜きの検証材料としては役に立たない**（会場の紙は必ずはみ出す）。

使い方:
    python3 tools/color-halloween-sheets.py <線画のフォルダ> <出力先> [枚数]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

# 子どもが使うクレヨンの色。くすませない（会場の紙は鮮やか）
PALETTES = {
    '01_kabocha': [(243, 128, 32), (255, 176, 59), (96, 170, 72), (237, 94, 54), (255, 214, 92)],
    '02_koumori': [(126, 76, 178), (62, 84, 170), (226, 90, 150), (80, 60, 140), (150, 110, 205)],
    '03_yurei':   [(118, 186, 232), (168, 206, 240), (142, 214, 196), (205, 180, 235), (96, 160, 220)],
    '04_majo':    [(124, 72, 170), (46, 140, 94), (232, 122, 54), (70, 104, 182), (214, 86, 122)],
    '05_franken': [(96, 176, 92), (58, 104, 176), (196, 92, 60), (240, 196, 72), (122, 86, 180)],
}
DEFAULT = [(236, 112, 64), (84, 150, 214), (104, 182, 110), (240, 196, 72), (170, 118, 206)]

INK = 110          # これより暗ければ線
WHITE_LEFT = 0.12  # 塗り残しの割合


def crayon(shape: tuple[int, int], rng: np.random.Generator) -> np.ndarray:
    """斜めの筋と、ゆるい濃淡。クレヨンは一様に乗らない。"""
    h, w = shape
    y, x = np.mgrid[0:h, 0:w]
    angle = rng.uniform(0.6, 1.1)
    period = max(6, min(h, w) / rng.uniform(90, 150))
    streak = 0.5 + 0.5 * np.sin((x * np.cos(angle) + y * np.sin(angle)) / period)
    coarse = ndimage.gaussian_filter(rng.random((h, w)), sigma=min(h, w) / 36)
    coarse = (coarse - coarse.min()) / max(1e-6, float(coarse.max() - coarse.min()))
    return 0.76 + 0.16 * streak + 0.14 * coarse


def color_sheet(path: Path, seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    gray = np.array(Image.open(path).convert('L'))
    h, w = gray.shape
    ink = gray < INK

    # 線で仕切られた区画を数える。画像の縁に触れるものは紙の外なので塗らない
    labels, count = ndimage.label(~ink)
    border = set(labels[0].tolist()) | set(labels[-1].tolist()) \
        | set(labels[:, 0].tolist()) | set(labels[:, -1].tolist())

    palette = list(PALETTES.get(path.stem, DEFAULT))
    rng.shuffle(palette)
    areas = ndimage.sum(np.ones_like(labels), labels, index=range(1, count + 1))
    order = [i + 1 for i in np.argsort(-areas) if (i + 1) not in border]

    paint = np.zeros((h, w, 3), dtype=float)
    painted = np.zeros((h, w), dtype=bool)
    for rank, region in enumerate(order):
        area = areas[region - 1]
        if area < h * w * 0.0006:      # 目や歯のような小さい区画は白のままにする
            continue
        color = palette[rank % len(palette)]
        mask = labels == region
        # 塗り残し。子どもは隅まで塗らない
        if rng.random() < 0.6:
            holes = ndimage.gaussian_filter(rng.random((h, w)), sigma=min(h, w) / 70)
            mask = mask & (holes > np.quantile(holes[mask], WHITE_LEFT))
        paint[mask] = color
        painted |= mask

    # はみ出し。塗る面を少しずらして、線の外へ色を出す
    shift = rng.integers(-int(h * 0.012), int(h * 0.012) + 1, size=2)
    painted_s = np.roll(painted, shift, axis=(0, 1))
    paint_s = np.roll(paint, shift, axis=(0, 1))
    spill = painted_s & ~painted & ~ink
    paint[spill] = paint_s[spill]
    painted |= spill

    texture = crayon((h, w), rng)[:, :, None]
    sheet = np.full((h, w, 3), 255.0)
    sheet[painted] = np.clip(paint[painted] * texture[painted] + 255 * (1 - texture[painted]) * 0.35,
                             0, 255)
    # 線は最後に乗せる。塗った色が線の上に来ると輪郭が切れる
    sheet[ink] = np.minimum(sheet[ink], gray[ink][:, None] * np.ones(3))
    return Image.fromarray(sheet.astype('uint8'))


def main() -> None:
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    many = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    out.mkdir(parents=True, exist_ok=True)
    for path in sorted(src.glob('*.png')):
        for n in range(many):
            image = color_sheet(path, seed=hash(path.stem) % 9999 + n * 101)
            name = f'{path.stem}-{n + 1}.png' if many > 1 else f'{path.stem}.png'
            image.save(out / name)
            print(f'  {name}')
    print(f'{out} に書きました')


if __name__ == '__main__':
    main()
