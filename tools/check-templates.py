#!/usr/bin/env python3
"""台紙（塗り絵の線画）が使えるかどうかを測る。

見るのは3つ。

1. **輪郭が閉じているか** — 切り抜きは「画像の外から届く白」だけを消す
   （`src/core/cutout.ts`）。線が1か所でも切れていると、そこから白が
   内側へ流れ込み、絵が穴だらけになる。線の面積に対して
   塗りつぶせた面積が小さければ、閉じていない。

2. **長辺と短辺の比** — 照合は回転を全部試すので「縦長/横長」は区別されない。
   比そのものは残るので、種類を離す手がかりになる。

3. **7種が互いに似ていないか** — 48升のシルエットの重なりを、
   4方向×左右反転の8通りで測り、一番高い値を採る。
   `src/core/match.ts` の `silhouette` / `overlap` / `matchTemplates` と同じ計算。
   **数字がずれたら match.ts が正**。あちらを直したらこちらも直す。

使い方:
    python3 tools/check-templates.py assets/templates
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

# 調べるときの長辺の上限（速さのため）
MAX_SIDE = 1000
# 升目の細かさ。match.ts の既定と合わせる
# `--verbose` で、変形の1つ1つの結果を出す。
# どの程度のゆがみで入れ替わるのかが分からないと、直すべきか判断できない
VERBOSE = '--verbose' in sys.argv

GRID = 48
# これより暗ければ線とみなす
INK_LEVEL = 140
# これ未満の濃さは透明（背景）とみなす
ALPHA_MIN = 12
# 「塗りつぶせた面積 ÷ 線の面積」がこれ未満なら、輪郭が閉じていない疑い
CLOSED_RATIO = 2.0
# どの2種もこれ未満であること
MAX_OVERLAP = 0.55
# 2位との差がこれ未満なら「際どい」。実物の写真ではもっと悪くなるので余裕を見る
MIN_MARGIN = 0.05
# 照合のときに試す傾き（度）。**`src/core/match.ts` の `MATCH_TILTS` と同じにする。**
# ここだけ変えると、この道具が実物より甘い（または厳しい）数字を出す
MATCH_TILTS = (-8, -4, 0, 4, 8)


def load_silhouette_mask(path):
    """線画を「塗ったあとの外形」に変える。

    塗り絵は線しか無いが、照合で使うのは**塗ったあとの絵の外形**なので、
    輪郭の内側を埋めた形にしてから比べないと意味が無い。
    """
    image = Image.open(path).convert('RGBA')
    # 大きい画像はここで縮める。48升に落とすので精度は変わらず、
    # 1枚あたりの待ち時間が数十秒から1秒以下になる
    if max(image.size) > MAX_SIDE:
        image.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    width, height = image.size
    px = image.load()

    # 線を 0、それ以外を 255 にした白黒。外周に余白を足して、
    # 絵が縁に触れていても外から回り込めるようにする
    pad = 4
    flat = Image.new('L', (width + pad * 2, height + pad * 2), 255)
    fp = flat.load()
    ink = 0
    for y in range(height):
        for x in range(width):
            r, g, b, a = px[x, y]
            if a < ALPHA_MIN:
                continue
            if (r * 299 + g * 587 + b * 114) / 1000 < INK_LEVEL:
                fp[x + pad, y + pad] = 0
                ink += 1

    # 外側の白を塗りつぶす。届かなかった白＝輪郭の内側
    ImageDraw.floodfill(flat, (0, 0), 128)
    inside = []
    filled = 0
    for y in range(flat.height):
        row = []
        for x in range(flat.width):
            solid = fp[x, y] != 128
            row.append(solid)
            if solid:
                filled += 1
        inside.append(row)
    return inside, ink, filled


def mask_image(mask):
    """外形を白黒画像にする。傾けたり伸ばしたりする試験に使う。"""
    height, width = len(mask), len(mask[0])
    image = Image.new('L', (width, height), 0)
    px = image.load()
    for y in range(height):
        row = mask[y]
        for x in range(width):
            if row[x]:
                px[x, y] = 255
    return image


def cells_from_image(image, size=GRID):
    """白黒画像を升目に落とす。"""
    box = image.getbbox()
    if box is None:
        return None
    cropped = image.crop(box)
    longest = max(cropped.size)
    square = Image.new('L', (longest, longest), 0)
    square.paste(cropped, ((longest - cropped.width) // 2, (longest - cropped.height) // 2))
    small = square.resize((size, size), Image.NEAREST)
    data = small.load()
    return [data[column, row] > 127 for row in range(size) for column in range(size)]


def to_cells(mask, size=GRID):
    """外形を正方形の升目に落とす（match.ts の silhouette と同じ）。"""
    ys = [y for y, row in enumerate(mask) if any(row)]
    xs = [x for x in range(len(mask[0])) if any(row[x] for row in mask)]
    if not ys or not xs:
        return None, 0, 0
    top, bottom = min(ys), max(ys)
    left, right = min(xs), max(xs)
    width = right - left + 1
    height = bottom - top + 1
    longest = max(width, height)
    offset_x = (longest - width) / 2
    offset_y = (longest - height) / 2

    cells = [False] * (size * size)
    for row in range(size):
        y = int(((row + 0.5) / size) * longest - offset_y)
        if y < 0 or y >= height:
            continue
        for column in range(size):
            x = int(((column + 0.5) / size) * longest - offset_x)
            if x < 0 or x >= width:
                continue
            cells[row * size + column] = mask[top + y][left + x]
    return cells, width, height


def turn(cells, turns, size=GRID):
    step = turns % 4
    if step == 0:
        return cells
    out = [False] * (size * size)
    for row in range(size):
        for column in range(size):
            if step == 1:
                to_row, to_column = column, size - 1 - row
            elif step == 2:
                to_row, to_column = size - 1 - row, size - 1 - column
            else:
                to_row, to_column = size - 1 - column, row
            out[to_row * size + to_column] = cells[row * size + column]
    return out


def mirror(cells, size=GRID):
    out = [False] * (size * size)
    for row in range(size):
        for column in range(size):
            out[row * size + (size - 1 - column)] = cells[row * size + column]
    return out


def overlap(a, b):
    both = sum(1 for x, y in zip(a, b) if x and y)
    either = sum(1 for x, y in zip(a, b) if x or y)
    return 0.0 if either == 0 else both / either


def tilted_cells(image, tilt):
    """絵を少し傾けてから升目に落とす。`match.ts` の `tiltedSilhouette` と同じ考え方。"""
    if tilt:
        image = image.rotate(tilt, expand=True, resample=Image.BILINEAR, fillcolor=0).point(
            lambda value: 255 if value >= 128 else 0
        )
    return cells_from_image(image)


def best_overlap(a, b):
    """8通りの向きで一番よく重なった値。"""
    best = 0.0
    for turns in range(4):
        turned = turn(a, turns)
        for flipped in (False, True):
            candidate = mirror(turned) if flipped else turned
            best = max(best, overlap(candidate, b))
    return best


def main():
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else 'assets/templates')
    files = sorted(folder.glob('*.png'))
    if not files:
        print(f'{folder} に PNG がありません')
        return 1

    names = []
    shapes = []
    images = []
    bad = 0
    print('== 1枚ずつの確認 ==')
    for path in files:
        mask, ink, filled = load_silhouette_mask(path)
        cells, width, height = to_cells(mask)
        if cells is None:
            print(f'{path.name}: 中身がありません')
            bad += 1
            continue
        ratio = filled / ink if ink else 0
        long_side, short_side = max(width, height), min(width, height)
        fill = sum(cells) / len(cells)
        note = ''
        if ratio < CLOSED_RATIO:
            note = '  ← **輪郭が閉じていない疑い。作り直し**'
            bad += 1
        print(
            f'{path.stem:16s} 比 {long_side / short_side:4.2f} : 1   '
            f'升目の詰まり {fill:4.2f}   塗りつぶし/線 {ratio:5.1f}{note}'
        )
        names.append(path.stem)
        shapes.append(cells)
        images.append(mask_image(mask))

    print('\n== 総当たりの重なり（8通りの向きで一番高い値）==')
    header = ' ' * 16 + ''.join(f'{n[:10]:>12s}' for n in names)
    print(header)
    worst = []
    for i, name in enumerate(names):
        row = f'{name[:16]:16s}'
        for j in range(len(names)):
            if i == j:
                row += f'{"-":>12s}'
                continue
            score = best_overlap(shapes[i], shapes[j])
            row += f'{score:12.2f}'
            if i < j:
                worst.append((score, names[i], names[j]))
        print(row)

    # ---- 実際に見分けられるかの試験 ----
    #
    # 総当たりの重なりが高くても、**自分の台紙との重なりのほうが高ければ**
    # 見分けはつく（照合は一番よく重なった台紙を選ぶ）。
    # そこで、塗った紙を撮ったときに起きる程度のゆがみ（少し傾く・少し伸びる）を
    # 掛けて、正しい台紙が1位になるかを数える。**ここが本当の合否**。
    print('\n== 見分けの試験（少し傾ける・少し伸ばす）==')
    trials = [(0, 1.0, 1.0), (-6, 1.0, 1.0), (6, 1.0, 1.0), (-3, 1.06, 1.0),
              (3, 1.0, 1.06), (0, 1.08, 1.0), (0, 1.0, 1.08), (10, 1.0, 1.0)]
    total = 0
    wrong = 0
    worst_margin = (9.9, '', '')
    for index, name in enumerate(names):
        image = images[index]
        margins = []
        for angle, scale_x, scale_y in trials:
            turned = image.rotate(angle, expand=True, resample=Image.BILINEAR, fillcolor=0)
            stretched = turned.resize(
                (max(1, int(turned.width * scale_x)), max(1, int(turned.height * scale_y))),
                Image.BILINEAR,
            ).point(lambda value: 255 if value >= 128 else 0)
            # **アプリと同じように、少し傾けても試す**（match.ts の MATCH_TILTS）。
            # ここを 0 だけにすると、実物より厳しい数字が出る
            grids = [g for g in (tilted_cells(stretched, tilt) for tilt in MATCH_TILTS) if g]
            if not grids:
                continue
            cells = grids[len(grids) // 2]
            scores = [(max(best_overlap(g, shapes[other]) for g in grids), names[other])
                      for other in range(len(names))]
            scores.sort(reverse=True)
            total += 1
            mine = next(score for score, who in scores if who == name)
            if VERBOSE:
                flag = '' if scores[0][1] == name else f'   ← {scores[0][1]} と判定'
                print(f'    傾き{angle:+3d}° 横×{scale_x} 縦×{scale_y}  '
                      f'自分 {mine:.2f}  1位 {scores[0][1]} {scores[0][0]:.2f}{flag}')
            rival, rival_name = next((score, who) for score, who in scores if who != name)
            margins.append(mine - rival)
            if scores[0][1] != name:
                wrong += 1
                print(f'  [NG] {name} が {scores[0][1]} と judged（自分 {mine:.2f} / 相手 {scores[0][0]:.2f}）')
            if mine - rival < worst_margin[0]:
                worst_margin = (mine - rival, name, rival_name)
        print(f'  {name[:22]:22s} 自分との差の最小 {min(margins):+.2f}  平均 {sum(margins)/len(margins):+.2f}')

    print(f'\n  {total - wrong}/{total} 回、正しい台紙が1位になった')
    print(f'  いちばん際どい組: {worst_margin[1]} ↔ {worst_margin[2]}  差 {worst_margin[0]:+.2f}')

    # **合否は「見分けの試験」で見る。** 総当たりの重なりは警告として出すだけ。
    # 重なりが高くても、自分の台紙との重なりのほうが高ければ見分けはつく
    # （照合は一番よく重なった台紙を選ぶ）。実際、まる魚 ↔ タコは 0.66 と高いが、
    # 差は +0.20 あって一度も入れ替わらない。
    # ここを「0.55 未満なら合格」にしていたころは、通っている台紙を
    # 「作り直しが要る」と言い続けていた
    print(f'\n== 似ている組（{MAX_OVERLAP} 以上は警告。合否は上の見分けの試験）==')
    worst.sort(reverse=True)
    for score, a, b in worst[:5]:
        mark = '警告' if score >= MAX_OVERLAP else 'ok '
        print(f'  [{mark}] {a} ↔ {b}  {score:.2f}')

    print('\n== 判定 ==')
    if bad:
        print(f'**作り直しが要る**: 輪郭が閉じていない台紙が {bad} 枚。'
              '切り抜きで穴だらけになる')
        return 1
    if wrong:
        print(f'**作り直しが要る**: 見分けに失敗した回が {wrong} 回ある。'
              'しきい値を下げて逃げないこと。本番で別の生き物として判定される')
        return 1
    if worst_margin[0] < MIN_MARGIN:
        print(f'**際どい**: 2位との差が最小 {worst_margin[0]:+.2f}'
              f'（{worst_margin[1]} ↔ {worst_margin[2]}）。'
              f'{MIN_MARGIN:+.2f} は欲しい。紙の置き方が少しずれると入れ替わる')
        return 1
    print(f'合格。{total} 回すべてで正しい台紙が1位、'
          f'2位との差は最小でも {worst_margin[0]:+.2f}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
