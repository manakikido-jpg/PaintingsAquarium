#!/usr/bin/env python3
"""
アイコンの元絵から、配布に使う `build/icon.png` を作る。

    python3 tools/make-icon.py <元絵> [--crop 左,上,右,下] [--check]

元絵は「机の上に置かれた札」の絵で、**机の木目と影が写り込んでいる**。
アイコンは机の上に置くものではないので、木目と影は落とし、
札そのものだけを角の丸い正方形として切り出す。

やること

1. 四隅から色の近い所を塗りつぶして「外側（机・影）」を決める。
2. 残った中で一番大きい塊＝札。穴（札の中の白）は埋める。
3. その外接矩形で切り、正方形に整えて 1024×1024 にする。
4. 札の形をそのまま透過に使う。角の丸みはこれで付く。

`--check` を付けると、切り出した形を市松模様の上に重ねた確認用の絵も出す。
透過の抜けは、白い背景の上では見えない。

electron-builder は `build/icon.png` を見つけると、そこから
Windows 用の .ico（16〜256px）を自分で作る。設定に書く必要は無い
（`directories.buildResources: build` があるため）。
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'build/icon.png'
SIDE = 1024
# 四隅から広げるときの色の近さ（0〜255）。木目は濃淡があるので広めに取る
TOLERANCE = 60


def outside(rgb: np.ndarray) -> np.ndarray:
    """四隅から届く「机と影」を塗って、外側を求める。"""
    height, width = rgb.shape[:2]
    seeds = [(0, 0), (0, width - 1), (height - 1, 0), (height - 1, width - 1)]
    mark = np.zeros((height, width), dtype=bool)
    for y, x in seeds:
        if mark[y, x]:
            continue
        # その隅の色に近い画素だけを通す道を作り、隅からつながる所を塗る
        near = np.all(np.abs(rgb.astype(np.int16) - rgb[y, x].astype(np.int16)) <= TOLERANCE, axis=2)
        labels, _ = ndimage.label(near)
        if labels[y, x] != 0:
            mark |= labels == labels[y, x]
    return mark


def card(rgb: np.ndarray) -> np.ndarray:
    """札の形（角の丸い四角）を求める。"""
    inside = ~outside(rgb)
    labels, count = ndimage.label(inside)
    if count == 0:
        raise SystemExit('札が見つからない。--crop で範囲を指定してください')
    sizes = ndimage.sum(inside, labels, range(1, count + 1))
    biggest = int(np.argmax(sizes)) + 1
    mask = labels == biggest
    # 札の中の白（紙）が外側と同じ色で抜けることがある。穴は埋める
    return ndimage.binary_fill_holes(mask)


def square(image: Image.Image) -> Image.Image:
    """余白を足して正方形にする。切り落とすと札の角が欠ける。"""
    side = max(image.size)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        print(__doc__)
        return 1

    source = Image.open(args[0]).convert('RGBA')
    crop = next((a for a in sys.argv[1:] if a.startswith('--crop')), None)
    if crop:
        left, top, right, bottom = (int(v) for v in crop.split('=')[1].split(','))
        source = source.crop((left, top, right, bottom))

    rgb = np.asarray(source)[:, :, :3]
    mask = card(rgb)

    box = Image.fromarray((mask * 255).astype(np.uint8)).getbbox()
    if box is None:
        raise SystemExit('札の形が空。元絵を確かめてください')

    cut = source.crop(box)
    alpha = Image.fromarray((mask * 255).astype(np.uint8)).crop(box)
    cut.putalpha(alpha)

    icon = square(cut).resize((SIDE, SIDE), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    icon.save(OUT)

    filled = int(mask.sum()) / mask.size
    print(f'{OUT.relative_to(ROOT)}  {SIDE}x{SIDE}  元絵に占める札の割合 {filled * 100:.0f}%')
    if filled < 0.25:
        print('  ← 札が小さすぎる。机を札と取り違えている可能性がある。--check で確かめること')

    if '--check' in sys.argv:
        board = Image.new('RGBA', (SIDE, SIDE), (255, 255, 255, 255))
        draw = ImageDraw.Draw(board)
        for y in range(0, SIDE, 64):
            for x in range(0, SIDE, 64):
                if (x // 64 + y // 64) % 2:
                    draw.rectangle([x, y, x + 63, y + 63], fill=(200, 200, 200, 255))
        board.alpha_composite(icon)
        check = OUT.with_name('icon-check.png')
        board.save(check)
        print(f'  確認用: {check.relative_to(ROOT)}（市松が透けていれば透過は出ている）')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
