#!/usr/bin/env python3
"""台紙の線画から、**外枠とラベルを外して**印刷用・照合用の1枚にする。

なぜ要るのか
------------
生成された台紙には、ページを囲む**外枠**と `7. ウミガメ` のような
**ラベルの四角**が入っていることが多い。どちらも入ったままだと会場で壊れる。

- **外枠が致命的。** 切り抜きは「画像の外から届く白」だけを消すので
  （`src/core/cutout.ts`）、枠が写ると**枠の内側が丸ごと1つの塊**になる。
  泳ぐのは絵ではなく紙の四角になり、しかも7種とも同じ四角なので
  台紙の照合（`src/core/match.ts`）も全滅する。
- ラベルは、絵より十分小さければ捨てられるが（`regions.ts` の 5%）、
  **境目に近いので当てにしない**。ここで外しておく。

やること
--------
1. 線（暗い画素）のつながりを塊ごとに分ける
2. 画像のほぼ全体を覆う塊＝**外枠**として捨てる
3. **近い塊どうしをまとめて**、一番大きいまとまり＝生き物とする。
   離れたまとまり（ラベルの四角と文字）は捨てる。
   「一番大きい塊に重なるものだけ残す」では駄目だった。
   クラゲのかさと触手のように、**触れずに近いだけの部分が落ちる**
4. 生き物のまわりに余白を付けて切り出し、白い紙の上に置く

**出力した画像がそのまま印刷用の台紙**になる。枠もラベルも無い。

使い方:
    python3 tools/prep-templates.py <元の画像が入ったフォルダ> [出力先]
"""
import os
import sys
from collections import deque

from PIL import Image

# これより暗ければ線とみなす
INK_LEVEL = 140
# これ未満の濃さは透明（背景）とみなす
ALPHA_MIN = 12
# 縦横ともに画像のこの割合以上を覆う塊は「外枠」とみなす
FRAME_COVER = 0.88
# 塊として扱う最小の画素数（全体に対する割合）。これ未満は点や汚れ
MIN_BLOB = 0.00002
# 切り出したあとに付ける余白（生き物の長辺に対する割合）
MARGIN = 0.08
# この距離まで近ければ「同じ生き物の一部」とみなす（画像の長辺に対する割合）
NEAR = 0.03
# 線がこの割合以上「外接矩形のふち」に乗っていれば、四角い枠とみなす
BOX_EDGE_SHARE = 0.9
# 四角い枠とみなす大きさの上限（画像に対する面積の割合）。これ以上は外枠
BOX_MAX_AREA = 0.2
# 消すときに何画素太らせるか（線のふちの薄い灰色を残さないため）
ERASE_GROW = 2
# 調べるときの長辺の上限。大きい画像はここまで縮めてから処理する
MAX_SIDE = 1400


def ink_mask(image):
    width, height = image.size
    px = image.load()
    mask = bytearray(width * height)
    for y in range(height):
        row = y * width
        for x in range(width):
            r, g, b, a = px[x, y]
            if a < ALPHA_MIN:
                continue
            if (r * 299 + g * 587 + b * 114) / 1000 < INK_LEVEL:
                mask[row + x] = 1
    return mask


def blobs_of(mask, width, height, min_pixels):
    """つながっている線の塊を、外接矩形つきで返す。"""
    seen = bytearray(width * height)
    found = []
    for start in range(width * height):
        if not mask[start] or seen[start]:
            continue
        queue = deque([start])
        seen[start] = 1
        cells = []
        count = 0
        left = right = start % width
        top = bottom = start // width
        while queue:
            index = queue.popleft()
            cells.append(index)
            count += 1
            x, y = index % width, index // width
            left, right = min(left, x), max(right, x)
            top, bottom = min(top, y), max(bottom, y)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                nx, ny = x + dx, y + dy
                if nx < 0 or ny < 0 or nx >= width or ny >= height:
                    continue
                at = ny * width + nx
                if mask[at] and not seen[at]:
                    seen[at] = 1
                    queue.append(at)
        if count >= min_pixels:
            found.append({'count': count, 'box': (left, top, right, bottom), 'cells': cells})
    return found


def looks_like_box(blob, width):
    """ラベルの枠のような「四角い線」か。

    位置では判定しない。ラベルが絵の近くにあると、位置や距離では外せない
    （クラゲとウミガメで実際に残った）。**形で見る**。
    線のほとんどが外接矩形のふちに乗っていれば、それは四角い枠。
    """
    left, top, right, bottom = blob['box']
    box_width, box_height = right - left + 1, bottom - top + 1
    # 小さいものは枠と呼ばない。ひれの模様（小さな楕円）も
    # 「線が外接矩形のふちに乗っている」ので、大きさで除かないと枠に見える
    if box_width < width * 0.06 or box_height < width * 0.03:
        return False
    band = max(2, int(min(box_width, box_height) * 0.12))
    if box_width < band * 3 or box_height < band * 3:
        return False
    inside = 0
    for index in blob['cells']:
        x, y = index % width, index // width
        if x - left < band or right - x < band or y - top < band or bottom - y < band:
            inside += 1
    return inside / len(blob['cells']) >= BOX_EDGE_SHARE


def near(a, b, gap):
    """2つの外接矩形が `gap` 以内に近いか。"""
    return not (a[2] + gap < b[0] or b[2] + gap < a[0] or a[3] + gap < b[1] or b[3] + gap < a[1])


def cluster(blobs, gap):
    """近い塊どうしをまとめる。まとまりごとの一覧を返す。"""
    parent = list(range(len(blobs)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(blobs)):
        for j in range(i + 1, len(blobs)):
            if near(blobs[i]['box'], blobs[j]['box'], gap):
                parent[root(i)] = root(j)

    groups = {}
    for index, blob in enumerate(blobs):
        groups.setdefault(root(index), []).append(blob)
    return list(groups.values())


def prepare(path, out_path):
    image = Image.open(path).convert('RGBA')
    if max(image.size) > MAX_SIDE:
        image.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    width, height = image.size
    mask = ink_mask(image)
    found = blobs_of(mask, width, height, int(width * height * MIN_BLOB))
    if not found:
        return None, '線が見つかりません'

    # 外枠を捨てる
    frames = [
        blob
        for blob in found
        if (blob['box'][2] - blob['box'][0]) >= width * FRAME_COVER
        and (blob['box'][3] - blob['box'][1]) >= height * FRAME_COVER
    ]
    rest = [blob for blob in found if blob not in frames]
    if not rest:
        return None, '外枠しかありません'

    # ラベルの枠と、その中の文字を捨てる
    labels = [
        blob
        for blob in rest
        if (blob['box'][2] - blob['box'][0]) * (blob['box'][3] - blob['box'][1])
        < width * height * BOX_MAX_AREA
        and looks_like_box(blob, width)
    ]
    for label in labels:
        lx0, ly0, lx1, ly1 = label['box']
        rest = [
            blob
            for blob in rest
            if blob is label
            or not (blob['box'][0] >= lx0 and blob['box'][2] <= lx1
                    and blob['box'][1] >= ly0 and blob['box'][3] <= ly1)
        ]
    rest = [blob for blob in rest if blob not in labels]
    if not rest:
        return None, '生き物が見つかりません'

    # 近い塊どうしをまとめ、画素の多いまとまりを生き物とみなす
    groups = cluster(rest, int(max(width, height) * NEAR))
    keep = max(groups, key=lambda group: sum(blob['count'] for blob in group))
    drop = [blob for blob in found if blob not in keep]

    left = min(blob['box'][0] for blob in keep)
    top = min(blob['box'][1] for blob in keep)
    right = max(blob['box'][2] for blob in keep)
    bottom = max(blob['box'][3] for blob in keep)

    # 切り出す範囲を写す
    px = image.load()
    canvas = Image.new('RGB', (right - left + 1, bottom - top + 1), (255, 255, 255))
    target = canvas.load()
    for y in range(top, bottom + 1):
        for x in range(left, right + 1):
            target[x - left, y - top] = px[x, y][:3] if px[x, y][3] >= ALPHA_MIN else (255, 255, 255)

    # 捨てる塊を白で消す。**外接矩形ではなく画素そのもの**を消す。
    # 矩形で消すと、絵に重なった位置にある文字を消すときに絵まで欠ける。
    # 少し太らせて消すのは、線のふちの薄い灰色が輪だけ残るため。
    for blob in drop:
        for index in blob['cells']:
            x, y = index % width, index // width
            for dy in range(-ERASE_GROW, ERASE_GROW + 1):
                for dx in range(-ERASE_GROW, ERASE_GROW + 1):
                    ex, ey = x + dx, y + dy
                    if left <= ex <= right and top <= ey <= bottom:
                        target[ex - left, ey - top] = (255, 255, 255)

    margin = int(max(canvas.size) * MARGIN)
    sheet = Image.new('RGB', (canvas.width + margin * 2, canvas.height + margin * 2), (255, 255, 255))
    sheet.paste(canvas, (margin, margin))
    sheet.save(out_path)
    return sheet.size, f'外枠・ラベル・離れた塊を {len(drop)} 個外した'


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    src = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else 'assets/templates'
    os.makedirs(out_dir, exist_ok=True)

    names = sorted(
        name for name in os.listdir(src) if name.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))
    )
    if not names:
        print(f'{src} に画像がありません')
        return 1

    failed = 0
    for name in names:
        stem = os.path.splitext(name)[0]
        out_path = os.path.join(out_dir, f'{stem}.png')
        size, note = prepare(os.path.join(src, name), out_path)
        if size is None:
            print(f'{name}: {note}')
            failed += 1
        else:
            print(f'{name} → {os.path.basename(out_path)}  {size[0]}x{size[1]}  {note}')

    print(f'\n{len(names) - failed} 枚を {out_dir} に書いた')
    print('次: python3 tools/check-templates.py ' + out_dir)
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
