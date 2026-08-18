#!/usr/bin/env python3
"""
1枚にまとまった背景パーツの画像を、部品ごとの透明PNGに切り出す。

**まずアルファ（透過）を見る。** 生成画像は透過済みで届くことがあり、
その場合は自分で背景を判定してはいけない（実際、透過済みの絵を
「白背景のはず」と決めつけて背景除去を書いた。RGB側に残っていた
虹色の下絵を背景と誤認して、枝サンゴが溶けた）。

透過が入っていなければ、白背景の一覧とみなして
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
# これ未満の濃さの画素は「透明」とみなす
ALPHA_MIN = 12
# 全体のこれ以上が透明なら、「切り抜き済みの画像」と判断する
ALPHA_SHARE = 0.05
# これ未満の面積の塊は、点や汚れとして捨てる（全体に対する割合）
MIN_AREA_RATIO = 0.0006


def has_alpha(image):
    """すでに切り抜かれている画像かどうか。"""
    alpha = image.getchannel('A')
    clear = sum(alpha.histogram()[:ALPHA_MIN])
    return clear > image.width * image.height * ALPHA_SHARE


def load_mask(image, use_alpha):
    """部品にあたる画素を True にした一覧を返す。

    `use_alpha` のときは**アルファだけ**を見る。白の判定を混ぜてはいけない。
    粘土風の絵はハイライトが真っ白になることがあり、白を背景として抜くと
    部品の中に穴が空く。
    """
    width, height = image.size
    px = image.load()
    mask = bytearray(width * height)
    for y in range(height):
        row = y * width
        for x in range(width):
            r, g, b, a = px[x, y]
            if a < ALPHA_MIN:
                continue
            if not use_alpha and r > WHITE and g > WHITE and b > WHITE:
                # 白に近く、かつ色味が無いものだけを背景とみなす。
                # 明るい黄色などを白と間違えないよう、彩度も見る。
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
    use_alpha = has_alpha(image)
    print('切り抜き済みの画像として扱う（アルファを使う）' if use_alpha else '白背景の一覧として扱う')
    mask = load_mask(image, use_alpha)
    min_area = int(width * height * MIN_AREA_RATIO)
    blobs = components(mask, width, height, min_area)

    # 一覧と同じ「左上から右下」の順に並べる。
    # 縦位置を固定の升目で丸めると、背の高い部品が隣の段に落ちる。
    # 中心の高さが近いものを1段としてまとめてから、段の中を左→右に並べる。
    def centre(cells):
        ys = [c // width for c in cells]
        xs = [c % width for c in cells]
        return (sum(ys) / len(ys), min(xs))

    blobs.sort(key=lambda cells: centre(cells)[0])
    rows = []
    for cells in blobs:
        cy = centre(cells)[0]
        if rows and abs(cy - rows[-1][0]) < height * 0.12:
            rows[-1][1].append(cells)
        else:
            rows.append((cy, [cells]))
    blobs = [cells for _, row in rows for cells in sorted(row, key=lambda c: centre(c)[1])]

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
