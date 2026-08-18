#!/usr/bin/env python3
"""
1枚にまとまった背景パーツの画像を、部品ごとの透明PNGに切り出す。

生成した画像は白背景の一覧で届くことが多い。そのままでは使えないので、
    白を透明にする → つながっている塊ごとに分ける → 余白を詰める
の順で1つずつのPNGにする。

使い方:
    python3 tools/split-parts.py <入力画像> [出力先]

出力:
    assets/decor/part-01.png ... と assets/decor/parts.json（一覧）

**落ち影は描かせない指定にしてあるが**、生成物に薄い影が付いていることがある。
影は白より暗いので塊として残ってしまう。`--shadow` で下端の薄い画素を
落とせるようにしてある。
"""
import json
import os
import sys
from collections import deque

from PIL import Image

# これより明るい画素は「背景の白」とみなす
WHITE = 244
# これ未満の面積の塊は、点や汚れとして捨てる（全体に対する割合）
MIN_AREA_RATIO = 0.0006


def load_mask(image):
    """背景の白を除いた画素を True にした一覧を返す。"""
    width, height = image.size
    px = image.load()
    mask = bytearray(width * height)
    for y in range(height):
        row = y * width
        for x in range(width):
            r, g, b, a = px[x, y]
            if a < 24:
                continue
            # 白に近く、かつ色味が無いものだけを背景とみなす。
            # 明るい黄色などを白と間違えないよう、彩度も見る。
            if r > WHITE and g > WHITE and b > WHITE:
                continue
            mask[row + x] = 1
    return mask


def components(mask, width, height, min_area):
    """つながっている塊ごとに、その画素の一覧を返す。"""
    seen = bytearray(width * height)
    found = []
    for start in range(width * height):
        if mask[start] == 0 or seen[start]:
            continue
        queue = deque([start])
        seen[start] = 1
        cells = []
        while queue:
            index = queue.popleft()
            cells.append(index)
            x = index % width
            y = index // width
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if nx < 0 or ny < 0 or nx >= width or ny >= height:
                    continue
                at = ny * width + nx
                if mask[at] and not seen[at]:
                    seen[at] = 1
                    queue.append(at)
        if len(cells) >= min_area:
            found.append(cells)
    return found


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    source = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else 'assets/decor'
    os.makedirs(out_dir, exist_ok=True)

    image = Image.open(source).convert('RGBA')
    width, height = image.size
    mask = load_mask(image)
    min_area = int(width * height * MIN_AREA_RATIO)
    blobs = components(mask, width, height, min_area)

    # 左上から右下の順に並べる（一覧の並び順と合う）
    def key(cells):
        ys = [c // width for c in cells]
        xs = [c % width for c in cells]
        # 同じ行のものをまとめるため、縦は粗くする
        return (round(min(ys) / (height / 8)), min(xs))

    blobs.sort(key=key)

    px = image.load()
    manifest = []
    for number, cells in enumerate(blobs, start=1):
        xs = [c % width for c in cells]
        ys = [c // width for c in cells]
        left, right = min(xs), max(xs)
        top, bottom = min(ys), max(ys)
        part = Image.new('RGBA', (right - left + 1, bottom - top + 1), (0, 0, 0, 0))
        target = part.load()
        for c in cells:
            x = c % width
            y = c // width
            target[x - left, y - top] = px[x, y]
        name = f'part-{number:02d}.png'
        part.save(os.path.join(out_dir, name))
        manifest.append({
            'file': name,
            'width': part.width,
            'height': part.height,
            # 縦横比。置くときの目安に使う
            'ratio': round(part.width / part.height, 3),
        })
        print(f'{name}  {part.width}x{part.height}')

    with open(os.path.join(out_dir, 'parts.json'), 'w', encoding='utf-8') as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
    print(f'\n{len(manifest)} 個を切り出した → {out_dir}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
