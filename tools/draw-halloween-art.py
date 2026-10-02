#!/usr/bin/env python3
"""ハロウィン5種の台紙（線画）をコードで描く。

**なぜ画像生成ではなくコードなのか** — 台紙でいちばん重い規則は
「**輪郭を1か所も切らない**」こと（`docs/台紙の作り方.md` の1条）。
切れていると、そこから白が内側へ流れ込んで絵が穴だらけになる。
生成した絵はここが毎回あやしく、目では切れ目を見つけられない。

ここでは**シルエットを塗りつぶしの面として作り、その境界を線にする**ので、
輪郭は原理的に閉じる。顔や模様は、その内側に別の線として描き足す。

形の条件は `docs/設計-ハロウィンの台紙.md` の「狙い」に合わせてある。
**変えるときは `tools/check-templates.py` で測り直すこと。**

使い方:
    python3 tools/draw-halloween-art.py
    python3 tools/check-templates.py assets/templates/halloween
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

N = 2000
LINE = 10                      # 輪郭の太さ（画素）。2000px で 10px
# **紙の端まで描かない**（`docs/台紙の作り方.md` の6条）。
# 縁に触れる塊は切り抜きで捨てられるので、端まで届くと本体ごと消えかねない。
# 絵の座標 -1..1 を、紙の中央 86% に収める。
MARGIN = 0.86
OUT = Path(__file__).resolve().parent.parent / 'assets/templates/halloween'

yy, xx = np.mgrid[0:N, 0:N]
X = (xx - N / 2) / (N / 2) / MARGIN
Y = (yy - N / 2) / (N / 2) / MARGIN


def ellipse(cx, cy, rx, ry):
    return ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1


def box(x0, y0, x1, y1):
    return (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1)


def tri(p0, p1, p2):
    def side(a, b):
        return (b[0] - a[0]) * (Y - a[1]) - (b[1] - a[1]) * (X - a[0])
    d0, d1, d2 = side(p0, p1), side(p1, p2), side(p2, p0)
    return ((d0 >= 0) & (d1 >= 0) & (d2 >= 0)) | ((d0 <= 0) & (d1 <= 0) & (d2 <= 0))


def band(p0, p1, half):
    """p0-p1 を結ぶ太さ 2*half の棒（端は丸い）"""
    ax, ay = p0
    bx, by = p1
    dx, dy = bx - ax, by - ay
    t = np.clip(((X - ax) * dx + (Y - ay) * dy) / (dx * dx + dy * dy), 0, 1)
    return (X - (ax + t * dx)) ** 2 + (Y - (ay + t * dy)) ** 2 <= half ** 2


def poly(points):
    """凸多角形（最初の点から三角形に分ける）"""
    m = np.zeros((N, N), dtype=bool)
    for i in range(1, len(points) - 1):
        m |= tri(points[0], points[i], points[i + 1])
    return m


def vcurve(cx, cy, half_h, bulge, steps=36):
    """上下に伸びる、横へふくらんだ線（かぼちゃのうね用）"""
    t = np.linspace(-1, 1, steps)
    return list(zip(cx * (1 - 0.5 * t * t) + bulge * 0, cy + half_h * t)) if False else \
        list(zip(cx + bulge * (1 - t * t), cy + half_h * t))


def px(x, y):
    return (x * MARGIN + 1) / 2 * N, (y * MARGIN + 1) / 2 * N


class Sheet:
    """1枚の台紙。シルエットを足していき、最後に輪郭＋内側の線を描く。"""

    def __init__(self):
        self.mask = np.zeros((N, N), dtype=bool)
        self.inner = []          # あとで描く内側の線

    def add(self, m):
        self.mask |= m
        return self

    def cut(self, m):
        self.mask &= ~m
        return self

    # --- 内側の線（描画は最後にまとめて）---
    def line(self, points, width=LINE, closed=False):
        self.inner.append(('line', [px(*p) for p in points], width, closed))
        return self

    def oval(self, cx, cy, rx, ry, width=LINE, fill=False):
        self.inner.append(('oval', (cx, cy, rx, ry), width, fill))
        return self

    def arc_points(self, cx, cy, rx, ry, a0, a1, steps=40):
        a = np.linspace(np.radians(a0), np.radians(a1), steps)
        return list(zip(cx + rx * np.cos(a), cy + ry * np.sin(a)))

    def render(self, path):
        m = Image.fromarray((self.mask * 255).astype('uint8'))
        body = m.filter(ImageFilter.MinFilter(LINE * 2 + 1))
        edge = np.array(m) & ~np.array(body)
        # **内側の線は、輪郭より内側でしか描かない。**
        # はみ出すと外形が変わり、見分けの測定値が崩れる（うね・翼の骨で実際にはみ出した）
        room = np.array(m.filter(ImageFilter.MinFilter(LINE * 3 + 1))) > 0
        image = Image.new('L', (N, N), 255)
        d = ImageDraw.Draw(image)
        for item in self.inner:
            if item[0] == 'line':
                _, pts, w, closed = item
                d.line(pts + ([pts[0]] if closed else []), fill=0, width=w, joint='curve')
                for p in pts:                      # 角を丸めて線を途切れさせない
                    d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=0)
            else:
                _, (cx, cy, rx, ry), w, fill = item
                x0, y0 = px(cx - rx, cy - ry)
                x1, y1 = px(cx + rx, cy + ry)
                d.ellipse([x0, y0, x1, y1], outline=0, width=w, fill=0 if fill else None)
        drawn = (np.array(image) < 128) & room
        sheet = np.full((N, N), 255, dtype='uint8')
        sheet[edge > 0] = 0
        sheet[drawn] = 0
        image = Image.fromarray(sheet)
        image.save(path)
        h = np.any(self.mask, axis=1).sum()
        w = np.any(self.mask, axis=0).sum()
        return w, h


def kabocha():
    """ほぼ円（比 1.0）。外へ出る出っぱりはヘタ1本だけ。顔は内側の線なので自由。"""
    s = Sheet()
    s.add(ellipse(0, 0.06, 0.62, 0.58))
    s.add(poly([(-0.10, -0.44), (0.10, -0.44), (0.08, -0.72), (-0.02, -0.74), (-0.04, -0.46)]))
    s.line(vcurve(-0.30, 0.06, 0.50, -0.10))               # 縦のうね（左右対称）
    s.line(vcurve(0.30, 0.06, 0.50, 0.10))
    s.line([(-0.32, -0.16), (-0.08, -0.16), (-0.20, 0.06)], closed=True)   # 目
    s.line([(0.32, -0.16), (0.08, -0.16), (0.20, 0.06)], closed=True)
    s.line([(-0.08, 0.10), (0.08, 0.10), (0, 0.21)], closed=True)          # 鼻
    s.line([(-0.34, 0.27), (0.34, 0.27)] + s.arc_points(0, 0.27, 0.34, 0.24, 10, 170)[::-1],
           closed=True)                                                     # 口
    for cx in (-0.19, 0.0, 0.19):                                           # 歯
        s.line([(cx - 0.05, 0.27), (cx - 0.05, 0.37), (cx + 0.05, 0.36), (cx + 0.05, 0.27)])
    return s


def koumori():
    """極端な横長（比 2.2）。翼を広げきる。たたむと丸い塊になりかぼちゃと近づく。"""
    s = Sheet()
    body = ellipse(0, 0.02, 0.20, 0.32)
    ears = (tri((-0.19, -0.28), (-0.11, -0.60), (-0.02, -0.26))
            | tri((0.19, -0.28), (0.11, -0.60), (0.02, -0.26)))
    s.add(body | ears)
    for sgn in (-1, 1):
        wing = tri((sgn * 0.10, -0.16), (sgn * 0.98, -0.38), (sgn * 0.26, 0.30))
        wing |= tri((sgn * 0.98, -0.38), (sgn * 0.26, 0.30), (sgn * 0.74, 0.22))
        # 下の縁を丸くえぐって、こうもりらしい波にする
        for t, r in ((0.40, 0.19), (0.68, 0.17), (0.90, 0.13)):
            wing &= ~ellipse(sgn * t, 0.30 - (t - 0.26) * 0.62, r, r)
        s.add(wing)
        s.line([(sgn * 0.20, -0.08), (sgn * 0.62, -0.22)])      # 翼の骨（内側）
        s.line([(sgn * 0.20, 0.00), (sgn * 0.52, 0.06)])
    s.oval(-0.085, -0.08, 0.06, 0.07, fill=True)                # 目
    s.oval(0.085, -0.08, 0.06, 0.07, fill=True)
    s.line(s.arc_points(0, 0.02, 0.085, 0.07, 20, 160))         # 口
    s.line([(-0.055, 0.07), (-0.035, 0.14), (-0.015, 0.07)], closed=True)   # 牙
    s.line([(0.055, 0.07), (0.035, 0.14), (0.015, 0.07)], closed=True)
    return s


def yurei():
    """細長い布（比 2.5）。裾は深くえぐれた波3つ。崩すとかぼちゃと 0.77 で衝突する。"""
    s = Sheet()
    g = ellipse(0, -0.42, 0.30, 0.34) | box(-0.30, -0.42, 0.30, 0.52)
    for cx in (-0.20, 0.0, 0.20):
        g |= ellipse(cx, 0.52, 0.105, 0.20)
    s.add(g)
    for cx in (-0.10, 0.10, -0.30, 0.30):                       # 深い切れ込み
        s.cut(ellipse(cx, 0.60, 0.085, 0.26))
    s.oval(-0.115, -0.50, 0.075, 0.105, fill=True)              # 目
    s.oval(0.115, -0.50, 0.075, 0.105, fill=True)
    s.oval(0, -0.28, 0.08, 0.10)                                # ぽかんと開いた口
    return s


def majo():
    """ほうきに乗った斜めの姿。立ち姿にするとゆうれいと衝突する。"""
    s = Sheet()
    stick = band((-0.82, 0.50), (0.80, -0.28), 0.034)
    straw = poly([(0.72, -0.25), (0.99, -0.56), (0.99, -0.02), (0.86, 0.05)])
    cloak = poly([(-0.36, -0.08), (-0.08, -0.08), (-0.12, 0.24), (-0.60, 0.30), (-0.46, 0.08)])
    bodyw = ellipse(-0.22, 0.02, 0.155, 0.20)
    head = ellipse(-0.24, -0.22, 0.135, 0.140)
    hat = (tri((-0.46, -0.34), (-0.02, -0.34), (-0.34, -0.86))
           | band((-0.52, -0.34), (0.04, -0.34), 0.032))
    arm = band((-0.14, -0.02), (0.12, 0.10), 0.044)
    thigh = band((-0.10, 0.14), (0.14, 0.07), 0.054)
    boot = band((0.14, 0.07), (0.27, 0.16), 0.060)
    s.add(stick | straw | cloak | bodyw | head | hat | arm | thigh | boot)
    s.line([(-0.52, -0.34), (0.04, -0.34)])                     # 帽子のつば
    s.oval(-0.19, -0.24, 0.042, 0.052, fill=True)               # 目
    s.line(s.arc_points(-0.16, -0.16, 0.055, 0.045, 20, 160))   # 口
    s.line(s.arc_points(-0.24, -0.08, 0.115, 0.055, 200, 340))  # 襟
    s.line([(-0.30, 0.16), (-0.46, 0.22)])                      # マントのひだ
    s.line([(0.13, 0.03), (0.17, 0.12)])                        # 靴の口
    s.line([(0.58, -0.14), (0.66, -0.24)])                      # ほうきの結び目
    s.line([(0.65, -0.10), (0.73, -0.20)])
    for t in (-0.46, -0.30, -0.14, 0.00):                       # ほうきの筋
        s.line([(0.78, -0.26), (0.97, t)])
    return s


def franken():
    """平らな頭・首のボルト・腕は真横・脚は大きく開く（比 1.2）。棒立ちにしない。"""
    s = Sheet()
    head = box(-0.30, -0.86, 0.30, -0.46)
    bolts = box(-0.42, -0.44, -0.26, -0.35) | box(0.26, -0.44, 0.42, -0.35)
    neck = box(-0.15, -0.48, 0.15, -0.36)
    torso = box(-0.32, -0.40, 0.32, 0.16)
    arms = box(0.30, -0.34, 0.78, -0.16) | box(-0.78, -0.34, -0.30, -0.16)
    hands = box(0.74, -0.40, 0.92, -0.10) | box(-0.92, -0.40, -0.74, -0.10)
    legs = box(-0.32, 0.14, -0.10, 0.70) | box(0.10, 0.14, 0.32, 0.70)
    feet = box(-0.46, 0.64, -0.08, 0.80) | box(0.08, 0.64, 0.46, 0.80)
    s.add(head | bolts | neck | torso | arms | hands | legs | feet)
    s.line([(-0.30, -0.68), (0.30, -0.68)])                     # 前髪の生えぎわ
    for cx in (-0.20, -0.10, 0.0, 0.10, 0.20):                  # 髪の筋
        s.line([(cx, -0.86), (cx, -0.68)])
    s.oval(-0.14, -0.56, 0.058, 0.062, fill=True)               # 目
    s.oval(0.14, -0.56, 0.058, 0.062, fill=True)
    s.line(s.arc_points(0, -0.50, 0.12, 0.08, 20, 160))         # 口
    s.line([(-0.26, -0.44), (-0.26, -0.35)])                    # ボルトの区切り
    s.line([(0.26, -0.44), (0.26, -0.35)])
    s.line([(-0.32, -0.20), (0.32, -0.20)])                     # 上着の肩線
    s.line([(0, -0.20), (0, 0.16)])                             # 前あわせ
    for y in (-0.13, -0.05, 0.03, 0.11):                        # 縫い目
        s.line([(-0.07, y), (0.07, y)])
    s.line([(0.74, -0.34), (0.74, -0.16)])                      # 袖口
    s.line([(-0.74, -0.34), (-0.74, -0.16)])
    s.line([(-0.32, 0.64), (-0.10, 0.64)])                      # 靴の口
    s.line([(0.10, 0.64), (0.32, 0.64)])
    return s


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, make in (('01_kabocha', kabocha), ('02_koumori', koumori), ('03_yurei', yurei),
                       ('04_majo', majo), ('05_franken', franken)):
        w, h = make().render(OUT / f'{name}.png')
        print(f'{name:12} 外接 {w}x{h}  比 {max(w, h) / min(w, h):.2f}')
    print(f'→ {OUT}')


if __name__ == '__main__':
    main()
