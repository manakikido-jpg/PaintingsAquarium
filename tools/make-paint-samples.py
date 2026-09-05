#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
塗り方・取り込み方を変えた見本をまとめて作る（開発用）。

    python3 tools/make-paint-samples.py sheets/aquarium/01_sakana_A_marusakana.png 出力先

**「中が透明になる」「種類が付かない」の報告が来たら、まずこれを通すこと。**
会場からの報告は「色の塗り方によって」のように幅があるので、
1枚ずつ手で作っていると原因の見当が付かない。

2026-09-05 に 29通りを通したときは、**中が抜けるものは1つも無かった**
（中身 59〜71%）。種類が付かなかったのは次の2つだけ:

- 黒や紙に近い色で**印刷された線の上まで塗った**もの（輪郭が消える）
- 絵が画像の端で切れているもの

作る見本は3種類。

1. **色**（12通り）… うすい黄／水色／桃／灰／クリーム／緑／はだ色／
   こい黄／こい水色／こい緑／白／ほぼ紙色。線は上から描き直す
2. **塗り方**（6通り）… 線の上まで塗る／輪郭だけなぞる／かすれ／
   紙とほぼ同じ色 × 輪郭の切れ目
3. **取り込み方**（5通り）… 端で切れる／影の帯／斜め／網目／端まで塗る
"""
import sys
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

# 紙と見分けが付きにくい順に並べてある
COLOURS = [
    ('01-うすい黄', (252, 246, 200)),
    ('02-うすい水色', (214, 238, 248)),
    ('03-うすい桃', (250, 226, 230)),
    ('04-うすい灰（鉛筆）', (222, 222, 222)),
    ('05-クリーム', (250, 244, 226)),
    ('06-うすい緑', (222, 244, 220)),
    ('07-はだ色', (250, 224, 196)),
    ('08-こい黄', (250, 222, 60)),
    ('09-こい水色', (90, 190, 235)),
    ('10-こい緑', (90, 190, 110)),
    ('11-白（白クレヨン）', (255, 255, 255)),
    ('12-ほぼ紙色', (248, 245, 238)),
]
PALE = (250, 240, 205)
NEAR_PAPER = (248, 245, 238)
WHITE = (255, 255, 255)
GREY = (226, 226, 226)


def main() -> None:
    sheet, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    base = Image.open(sheet).convert('RGB')
    width, height = base.size
    grey = np.asarray(base.convert('L'))
    ink = base.convert('L').point(lambda v: 255 if v < 140 else 0)
    ys, xs = np.where(grey < 140)
    inside = ys > height * 0.25          # 題の文字は避ける
    ys, xs = ys[inside], xs[inside]
    top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    edge = list(zip(xs, ys))

    def fill(draw, colour, count=240, radius=(30, 70)):
        for _ in range(count):
            x = random.randint(left, right)
            y = random.randint(top, bottom)
            r = random.randint(*radius)
            draw.ellipse([x - r, y - r, x + r, y + r], fill=colour)

    def trace(draw, colour, count=300, radius=(20, 40)):
        """輪郭の上をなぞる。こどもは線の上まで塗る。"""
        for _ in range(count):
            x, y = edge[random.randrange(len(edge))]
            r = random.randint(*radius)
            draw.ellipse([x - r, y - r, x + r, y + r], fill=colour)

    def scanned(image):
        """走査したときの紙色に寄せる（わずかにクリーム）。"""
        px = np.asarray(image.convert('RGB')).astype(np.int16)
        px[:, :, 2] = np.clip(px[:, :, 2] - 8, 0, 255)
        px[:, :, 1] = np.clip(px[:, :, 1] - 2, 0, 255)
        return Image.fromarray(px.astype(np.uint8))

    def save(name, image):
        scanned(image).save(out / f'{name}.jpg', quality=92)

    def painted(colour=PALE, keep_line=True):
        image = base.copy()
        random.seed(5)
        fill(ImageDraw.Draw(image), colour)
        if keep_line:
            image.paste((0, 0, 0), (0, 0), ink)
        return image

    def gaps(image, radius, count=6):
        """輪郭に切れ目を入れる（印刷のかすれ・消しゴム）。"""
        px = np.asarray(image.convert('RGB')).copy()
        random.seed(7)
        for _ in range(count):
            y = ys[random.randrange(len(ys))]
            x = xs[random.randrange(len(xs))]
            px[max(0, y - radius):y + radius, max(0, x - radius):x + radius] = (252, 250, 244)
        return Image.fromarray(px)

    # 1. 色
    for name, colour in COLOURS:
        save(f'色-{name}', painted(colour))

    # 2. 塗り方
    for name, colour, gap in (
        ('A-うすい黄・線の上も塗る', PALE, 0),
        ('B-白・線の上も塗る', WHITE, 0),
        ('C-ほぼ紙色・線の上も塗る', NEAR_PAPER, 0),
        ('D-うすい灰・線を覆う＋切れ目2mm', GREY, 12),
        ('E-ほぼ紙色・線を覆う＋切れ目2mm', NEAR_PAPER, 12),
    ):
        image = base.copy()
        random.seed(5)
        draw = ImageDraw.Draw(image)
        fill(draw, colour)
        trace(draw, colour)
        save(f'塗り方-{name}', gaps(image, gap) if gap else image)

    image = base.copy()
    random.seed(5)
    trace(ImageDraw.Draw(image), PALE)
    save('塗り方-F-輪郭だけなぞる', image)

    # 3. 取り込み方
    save('取込-M-絵が端で切れる',
         painted().crop((left + 120, top + 80, right + 200, bottom + 200)))
    shadow = painted()
    ImageDraw.Draw(shadow).rectangle([0, 0, width, int(height * 0.05)], fill=(120, 118, 112))
    save('取込-N-端に影の帯', shadow)
    save('取込-O-斜めに置いた',
         painted().rotate(7, expand=True, fillcolor=(250, 248, 242)))
    mesh = base.copy()
    random.seed(9)
    fill(ImageDraw.Draw(mesh), PALE, count=1200, radius=(6, 14))
    mesh.paste((0, 0, 0), (0, 0), ink)
    save('取込-P-かすれた塗り（網目）', mesh)

    print(f'{len(list(out.glob("*.jpg")))} 枚を {out} に作った')


if __name__ == '__main__':
    main()
