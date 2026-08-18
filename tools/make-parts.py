#!/usr/bin/env python3
"""背景パーツ（岩・サンゴ・海藻）の PNG を生成する。

なぜ生成するのか
----------------
図形とグラデーションを **毎フレーム** 描く方式は、どれだけ手を入れても
「多角形とグラデーション」に見えた（R-025）。パーツを画像として一度だけ
作っておけば、描画は 1 個につき `drawImage` 1 回で済み、
作り込みにいくら時間をかけても実行時の負荷は増えない。

粘土風に見せるための 4 点（R-025 の原因そのもの）
1. **左右対称にしない** — 半円を並べると玩具に見える
2. **べた塗りにしない** — 上が明るく下が暗い縦方向の明暗を必ず入れる
3. **縁に光と影を入れる** — 上の縁に光、下の縁に影。厚みはここで出る
4. **落ち影は描かない** — 接地の影は描画側（drawParts）が付ける。
   画像に焼くと、置き場所によって影の向きが合わなくなる

使い方:
    python3 tools/make-parts.py assets/decor
"""

from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

# 作業解像度。最後に半分へ縮めるので、出力はこの半分になる。
# 縮小そのものがアンチエイリアスになるため、縁が硬くならない。
CANVAS = 1600
SUPER = 2

Rgb = tuple[int, int, int]


def mix(a: Rgb, b: Rgb, t: float) -> Rgb:
    return (
        round(a[0] + (b[0] - a[0]) * t),
        round(a[1] + (b[1] - a[1]) * t),
        round(a[2] + (b[2] - a[2]) * t),
    )


def lighten(c: Rgb, t: float) -> Rgb:
    return mix(c, (255, 255, 255), t)


def darken(c: Rgb, t: float) -> Rgb:
    # 黒へ寄せると濁るので、濃い青へ寄せる。水中の陰は青い
    return mix(c, (18, 40, 96), t)


def blob_points(
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    rng: random.Random,
    wobble: float = 0.13,
    flat_bottom: float = 0.0,
    steps: int = 220,
) -> list[tuple[float, float]]:
    """ゆがんだ楕円の輪郭点。

    低い周波数の波を 3 本重ねる。乱数を点ごとに振ると縁がぎざぎざになり、
    波 1 本だと左右対称の繭になる。3 本重ねると左右非対称の塊になる。
    """
    k1, k2, k3 = rng.randint(2, 3), rng.randint(3, 5), rng.randint(5, 7)
    p1, p2, p3 = rng.uniform(0, 6.3), rng.uniform(0, 6.3), rng.uniform(0, 6.3)
    points: list[tuple[float, float]] = []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        r = 1 + wobble * (
            0.55 * math.sin(a * k1 + p1)
            + 0.30 * math.sin(a * k2 + p2)
            + 0.15 * math.sin(a * k3 + p3)
        )
        x = cx + rx * r * math.cos(a)
        y = cy + ry * r * math.sin(a)
        if flat_bottom > 0 and math.sin(a) > 0:
            # 地面に接する側だけ平らに寄せる。真円だと浮いて見える
            y = cy + ry * r * math.sin(a) * (1 - flat_bottom * math.sin(a))
        points.append((x, y))
    return points


def mask_from_points(size: int, points: list[tuple[float, float]]) -> Image.Image:
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask


def shift(mask: Image.Image, dx: int, dy: int) -> Image.Image:
    out = Image.new('L', mask.size, 0)
    out.paste(mask, (dx, dy))
    return out



def stroke(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[float, float]],
    width_start: float,
    width_end: float,
    steps: int = 160,
) -> tuple[float, float]:
    """太さが変わる棒を描く。

    `ImageDraw.line` の幅を少しずつ変える書き方だと、幅が整数に丸まる
    たびに縁へ**等間隔の刻み目**が出る（実際に出た）。円を密に並べれば
    半径が小数のまま効くので、縁がなめらかにつながる。
    """
    total = len(points) - 1
    px, py = points[0]
    for i in range(steps + 1):
        t = i / steps
        pos = t * total
        j = min(total - 1, int(pos))
        f = pos - j
        px = points[j][0] + (points[j + 1][0] - points[j][0]) * f
        py = points[j][1] + (points[j + 1][1] - points[j][1]) * f
        r = (width_start + (width_end - width_start) * t) / 2
        draw.ellipse([px - r, py - r, px + r, py + r], fill=255)
    return px, py


def clay(
    size: int,
    mask: Image.Image,
    base: Rgb,
    rng: random.Random,
    speckles: int = 0,
    rim: float = 1.0,
) -> Image.Image:
    """マスクの形を粘土のように塗る。"""
    box = mask.getbbox()
    if box is None:
        return Image.new('RGBA', (size, size), (0, 0, 0, 0))
    _, top, _, bottom = box
    height = max(1, bottom - top)

    # 1. 縦方向の明暗。上が明るく下が暗い
    grad = Image.new('RGB', (1, height))
    gp = grad.load()
    for y in range(height):
        t = y / height
        gp[0, y] = mix(lighten(base, 0.26), darken(base, 0.34), t ** 0.85)
    layer = Image.new('RGB', (size, size), base)
    layer.paste(grad.resize((size, height), Image.BILINEAR), (0, top))

    draw = ImageDraw.Draw(layer)

    # 2. 上の縁の光。マスクから「下へずらしたマスク」を引いた帯
    d = max(3, int(size * 0.012))
    if rim > 0:
        top_edge = Image.new('L', (size, size), 0)
        top_edge.paste(shift(mask, 0, d), (0, 0))
        top_edge = Image.eval(top_edge, lambda v: 255 - v)
        top_edge = Image.composite(top_edge, Image.new('L', (size, size), 0), mask)
        top_edge = top_edge.filter(ImageFilter.GaussianBlur(d * 0.9))
        top_edge = Image.eval(top_edge, lambda v: int(v * 0.85 * rim))
        layer.paste(Image.new('RGB', (size, size), lighten(base, 0.62)), (0, 0), top_edge)

        # 3. 下の縁の影。厚みはここで出る
        bottom_edge = Image.new('L', (size, size), 0)
        bottom_edge.paste(shift(mask, 0, -d * 2), (0, 0))
        bottom_edge = Image.eval(bottom_edge, lambda v: 255 - v)
        bottom_edge = Image.composite(bottom_edge, Image.new('L', (size, size), 0), mask)
        bottom_edge = bottom_edge.filter(ImageFilter.GaussianBlur(d * 1.4))
        bottom_edge = Image.eval(bottom_edge, lambda v: int(v * 0.7 * rim))
        layer.paste(Image.new('RGB', (size, size), darken(base, 0.5)), (0, 0), bottom_edge)

    # 4. 斑点。粘土に混ぜ込んだ粒に見せる。無地だと平らに見える
    if speckles:
        left, top2, right, bottom2 = box
        for _ in range(speckles):
            sx = rng.uniform(left, right)
            sy = rng.uniform(top2, bottom2)
            sr = rng.uniform(size * 0.006, size * 0.016)
            tone = lighten(base, rng.uniform(0.3, 0.55)) if rng.random() < 0.7 else darken(base, 0.25)
            draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=tone)
        spots = Image.new('L', (size, size), 0)
        # 斑点は形の中だけに残す
        layer = Image.composite(layer, layer, spots) if False else layer

    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(layer, (0, 0), mask)
    return out


def over(base: Image.Image, top: Image.Image) -> Image.Image:
    return Image.alpha_composite(base, top)


# ---------------------------------------------------------------- パーツ本体

def rock_cluster(rng: random.Random, palette: list[Rgb]) -> Image.Image:
    """丸い石の集まり。奥の石から手前の石へ順に重ねる。"""
    size = CANVAS
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ground = size * 0.86
    count = rng.randint(3, 5)
    # 大きい石を先に置き、小さい石を手前に足す
    sizes = sorted([rng.uniform(0.16, 0.30) for _ in range(count)], reverse=True)
    xs = [0.5 + (i - (count - 1) / 2) * rng.uniform(0.16, 0.24) for i in range(count)]
    rng.shuffle(xs)
    for i, (s, xr) in enumerate(zip(sizes, xs)):
        rx = size * s
        ry = rx * rng.uniform(0.62, 0.86)
        cx = size * min(0.84, max(0.16, xr))
        cy = ground - ry * rng.uniform(0.55, 0.9)
        colour = palette[i % len(palette)]
        pts = blob_points(cx, cy, rx, ry, rng, wobble=rng.uniform(0.09, 0.16), flat_bottom=0.35)
        m = mask_from_points(size, pts)
        out = over(out, clay(size, m, colour, rng, speckles=rng.randint(6, 14)))
    return out


def pebbles(rng: random.Random, palette: list[Rgb]) -> Image.Image:
    """小石の散らばり。大きい岩の足元の隙間を埋める。"""
    size = CANVAS
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ground = size * 0.8
    for i in range(rng.randint(4, 7)):
        rx = size * rng.uniform(0.07, 0.13)
        ry = rx * rng.uniform(0.55, 0.8)
        cx = size * rng.uniform(0.2, 0.8)
        cy = ground - ry * rng.uniform(0.4, 1.6)
        pts = blob_points(cx, cy, rx, ry, rng, wobble=0.14, flat_bottom=0.3)
        out = over(out, clay(size, mask_from_points(size, pts), palette[i % len(palette)], rng, speckles=4))
    return out


def branch_coral(rng: random.Random, base: Rgb) -> Image.Image:
    """枝サンゴ。幹から分かれ、先が丸い。

    細長い棒にしない。参考にした粘土の作りは、**幹が太く枝が短い**。
    細くすると水中で線に見え、泳ぐ絵の邪魔にもなる。
    """
    size = CANVAS
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    ground = size * 0.92
    trunk_w = size * rng.uniform(0.13, 0.17)

    def limb(x: float, y: float, angle: float, length: float, width: float, depth: int) -> None:
        pts = [(x, y)]
        px, py = x, y
        bend = rng.uniform(-0.5, 0.5)
        for i in range(1, 9):
            a = angle + bend * (i / 8) ** 2
            px += math.cos(a) * length / 8
            py -= math.sin(a) * length / 8
            pts.append((px, py))
        ex, ey = stroke(draw, pts, width, width * 0.72)
        tip = width * 0.36
        draw.ellipse([ex - tip, ey - tip, ex + tip, ey + tip], fill=255)
        if depth > 0:
            for k in range(rng.randint(2, 3)):
                spread = rng.uniform(0.45, 0.95) * (1 if k % 2 == 0 else -1)
                limb(ex, ey, angle + spread, length * rng.uniform(0.55, 0.75), width * 0.66, depth - 1)

    limb(size * 0.5, ground, math.pi / 2, size * 0.2, trunk_w, 2)
    return clay(size, mask, base, rng, rim=0.9)


def brain_coral(rng: random.Random, base: Rgb) -> Image.Image:
    """脳サンゴ。丸いかたまりに、うねった溝を彫る。"""
    size = CANVAS
    ground = size * 0.86
    rx = size * rng.uniform(0.26, 0.33)
    ry = rx * rng.uniform(0.7, 0.95)
    cx, cy = size * 0.5, ground - ry * 0.85
    pts = blob_points(cx, cy, rx, ry, rng, wobble=0.08, flat_bottom=0.4)
    mask = mask_from_points(size, pts)
    body = clay(size, mask, base, rng)

    # 溝。暗い線のすぐ上に明るい線を置くと、彫られたように見える。
    # 本数を増やすと落書きになる（増やして失敗した）。太く少なく。
    groove = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(groove)
    w = max(6, int(size * 0.026))
    dark = darken(base, 0.3) + (255,)
    light = lighten(base, 0.42) + (255,)
    rows = 5
    for row in range(rows):
        y0 = cy - ry * 0.55 + ry * 1.15 * row / (rows - 1)
        cycles = rng.uniform(1.1, 1.7)
        phase = rng.uniform(0, 6.3)
        line = []
        for i in range(60):
            t = i / 59
            x = cx - rx * 0.95 + rx * 1.9 * t
            y = y0 + math.sin(t * math.pi * cycles + phase) * ry * 0.08
            line.append((x, y))
        gd.line([(x, y + w * 0.85) for x, y in line], fill=light, width=w, joint='curve')
        gd.line(line, fill=dark, width=w, joint='curve')
    groove = groove.filter(ImageFilter.GaussianBlur(size * 0.004))
    groove.putalpha(Image.composite(groove.getchannel('A'), Image.new('L', (size, size), 0), mask))
    return over(body, groove)


def seaweed(rng: random.Random, palette: list[Rgb]) -> Image.Image:
    """海藻の株。太さの違う帯を数本、根元から扇状に。

    細い糸を何本も生やすと**麺**に見える（実際にそうなった）。
    太く・短く・本数を減らす。
    """
    size = CANVAS
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ground = size * 0.95
    blades = rng.randint(3, 5)
    for i in range(blades):
        mask = Image.new('L', (size, size), 0)
        draw = ImageDraw.Draw(mask)
        lean = (i - (blades - 1) / 2) * rng.uniform(0.12, 0.2)
        height = size * rng.uniform(0.34, 0.5)
        width = size * rng.uniform(0.1, 0.15)
        x, y = size * (0.5 + lean * 0.3), ground
        bend = rng.uniform(0.5, 1.1) * (1 if lean >= 0 else -1)
        pts = [(x, y)]
        for s_i in range(1, 13):
            t = s_i / 12
            px = x + math.sin(t * math.pi * 0.75) * size * 0.1 * bend + lean * size * 0.4 * t
            py = y - height * t
            pts.append((px, py))
        ex, ey = stroke(draw, pts, width, width * 0.35)
        tip = width * 0.17
        draw.ellipse([ex - tip, ey - tip, ex + tip, ey + tip], fill=255)
        out = over(out, clay(size, mask, palette[i % len(palette)], rng, rim=0.8))
    return out


# ---------------------------------------------------------------- 色

ORANGE: Rgb = (255, 122, 61)
PINK: Rgb = (255, 106, 158)
TEAL: Rgb = (46, 199, 184)
YELLOW: Rgb = (255, 199, 60)
BLUE: Rgb = (74, 139, 255)
GREEN: Rgb = (110, 212, 106)
PURPLE: Rgb = (168, 122, 255)
MINT: Rgb = (126, 232, 198)


def build(out_dir: Path) -> None:
    rng = random.Random(20260818)
    jobs: list[tuple[str, callable]] = []

    rock_palettes = [
        [ORANGE, lighten(ORANGE, 0.2), YELLOW],
        [PINK, lighten(PINK, 0.22), PURPLE],
        [TEAL, MINT, lighten(TEAL, 0.25)],
        [YELLOW, lighten(YELLOW, 0.18), ORANGE],
        [BLUE, lighten(BLUE, 0.25), PURPLE],
        [GREEN, MINT, lighten(GREEN, 0.2)],
    ]
    for p in rock_palettes:
        jobs.append(('rock', lambda r, p=p: rock_cluster(r, p)))
    for c in (ORANGE, PINK, TEAL, YELLOW):
        jobs.append(('branch', lambda r, c=c: branch_coral(r, c)))
    for c in (PURPLE, GREEN, BLUE, PINK):
        jobs.append(('brain', lambda r, c=c: brain_coral(r, c)))
    for p in ([GREEN, MINT], [TEAL, GREEN], [MINT, YELLOW]):
        jobs.append(('weed', lambda r, p=p: seaweed(r, p)))
    for p in ([ORANGE, YELLOW, PINK], [BLUE, PURPLE, TEAL], [GREEN, MINT, YELLOW]):
        jobs.append(('pebble', lambda r, p=p: pebbles(r, p)))

    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob('part-*.png'):
        old.unlink()

    manifest = []
    for index, (kind, make) in enumerate(jobs):
        image = make(rng)
        box = image.getbbox()
        if box is None:
            raise SystemExit(f'パーツ {index} が空になりました（形が作れていません）')
        image = image.crop(box)
        image = image.resize((image.width // SUPER, image.height // SUPER), Image.LANCZOS)
        name = f'part-{index:02d}.png'
        image.save(out_dir / name)
        manifest.append({'file': name, 'kind': kind, 'width': image.width, 'height': image.height})
        print(f'{name}  {kind:7s} {image.width}x{image.height}')

    (out_dir / 'parts.json').write_text(
        json.dumps({'parts': manifest}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    print(f'\n{len(manifest)} 個を {out_dir} に書きました')


if __name__ == '__main__':
    build(Path(sys.argv[1] if len(sys.argv) > 1 else 'assets/decor'))
