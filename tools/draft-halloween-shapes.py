"""ハロウィン5種の**形の当たり**を作る。絵を描くための道具ではない。

**何のためにあるか** — 台紙の線画を発注・生成する前に、
「その5種が互いに見分けられるか」を先に測るため。
照合は外形の重なりしか見ず、しかも4方向＋左右反転を試すので、
**形が似ていると後からでは直せない**（線画を描き直すしかない）。

最初の案では **かぼちゃ ↔ 幽霊 が 0.77** だった。
これは「ほそ魚とサメ（0.78）」で落としたのと同じ水準。
幽霊を縦長にして裾を深くえぐり、フランケンの腕と脚を広げて 0.52 まで下げた。

使い方:
    python3 tools/draft-halloween-shapes.py
    python3 tools/check-templates.py assets/templates/halloween-draft
"""
import numpy as np
from PIL import Image
from pathlib import Path

N = 1200          # 作業用の正方格子
LINE = 7          # 輪郭の太さ（画素）
OUT = Path(__file__).resolve().parent.parent / 'assets/templates/halloween-draft'
OUT.mkdir(parents=True, exist_ok=True)

yy, xx = np.mgrid[0:N, 0:N]
x = (xx - N / 2) / (N / 2)       # -1..1
y = (yy - N / 2) / (N / 2)

def ellipse(cx, cy, rx, ry):
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1

def box(x0, y0, x1, y1):
    return (x >= x0) & (x <= x1) & (y >= y0) & (y <= y1)

def tri(p0, p1, p2):
    def side(a, b):
        return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
    d0, d1, d2 = side(p0, p1), side(p1, p2), side(p2, p0)
    return ((d0 >= 0) & (d1 >= 0) & (d2 >= 0)) | ((d0 <= 0) & (d1 <= 0) & (d2 <= 0))

def band(p0, p1, half):
    """p0-p1 を結ぶ太さ 2*half の棒"""
    ax, ay = p0; bx, by = p1
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = np.clip(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1)
    return (x - (ax + t * dx)) ** 2 + (y - (ay + t * dy)) ** 2 <= half ** 2

shapes = {}

# 1 かぼちゃ … ほぼ円。出っぱりはヘタ1本だけ
shapes['01_kabocha'] = ellipse(0, 0.08, 0.60, 0.52) | box(-0.07, -0.60, 0.07, -0.38)

# 2 こうもり … 翼が左右へ大きく張り出す。極端な横長
wing_l = tri((-0.12, -0.10), (-0.98, -0.34), (-0.20, 0.30)) | tri((-0.98, -0.34), (-0.62, 0.26), (-0.20, 0.30))
wing_r = tri((0.12, -0.10), (0.98, -0.34), (0.20, 0.30)) | tri((0.98, -0.34), (0.62, 0.26), (0.20, 0.30))
ears = tri((-0.17, -0.30), (-0.09, -0.56), (-0.02, -0.28)) | tri((0.17, -0.30), (0.09, -0.56), (0.02, -0.28))
shapes['02_koumori'] = ellipse(0, 0.0, 0.19, 0.30) | wing_l | wing_r | ears

# 3 幽霊 … 縦長の布。下は**深く**えぐれた波3つ。かぼちゃ（丸）から比で離す
ghost = ellipse(0, -0.42, 0.30, 0.34) | box(-0.30, -0.42, 0.30, 0.52)
# 裾の波: 山3つ＋山の間を深くえぐる
for cx in (-0.20, 0.0, 0.20):
    ghost |= ellipse(cx, 0.52, 0.105, 0.20)
for cx in (-0.10, 0.10):
    ghost &= ~ellipse(cx, 0.60, 0.085, 0.26)
ghost &= ~ellipse(-0.30, 0.60, 0.085, 0.26)
ghost &= ~ellipse(0.30, 0.60, 0.085, 0.26)
shapes['03_yurei'] = ghost

# 4 ほうきの魔女 … 斜めの長い棒＋人。中身がすかすかな対角線
broom = band((-0.92, 0.55), (0.80, -0.30), 0.045)
straw = tri((0.80, -0.30), (0.99, -0.52), (0.99, -0.10))
body = ellipse(-0.18, 0.08, 0.17, 0.26)
hat = tri((-0.44, -0.16), (-0.02, -0.16), (-0.30, -0.72)) | box(-0.47, -0.19, 0.03, -0.13)
legs = band((-0.18, 0.26), (0.16, 0.14), 0.055)
shapes['04_majo'] = broom | straw | body | hat | legs

# 5 フランケンシュタイン … 角ばった頭＋首のボルト＋腕は真横＋脚は大きく開く
head = box(-0.28, -0.82, 0.28, -0.46)          # 平らな頭
bolts = box(-0.40, -0.44, 0.40, -0.36)          # 首のボルトが横へ出る
torso = box(-0.32, -0.40, 0.32, 0.14)
arms = box(0.30, -0.34, 0.92, -0.18) | box(-0.92, -0.34, -0.30, -0.18)
hands = box(0.86, -0.40, 0.99, -0.12) | box(-0.99, -0.40, -0.86, -0.12)
legs5 = box(-0.34, 0.12, -0.12, 0.74) | box(0.12, 0.12, 0.34, 0.74)   # 脚の間を広く空ける
feet = box(-0.46, 0.68, -0.10, 0.80) | box(0.10, 0.68, 0.46, 0.80)
shapes['05_franken'] = head | bolts | torso | arms | hands | legs5 | feet

def outline_png(mask, path):
    from PIL import ImageFilter
    m = Image.fromarray((mask * 255).astype('uint8'))
    inner = m.filter(ImageFilter.MinFilter(LINE * 2 + 1))
    line = np.array(m) & ~np.array(inner)
    sheet = np.full((N, N), 255, dtype='uint8')
    sheet[line > 0] = 0
    Image.fromarray(sheet).resize((1000, 1000), Image.LANCZOS).point(lambda v: 0 if v < 160 else 255).save(path)

for name, mask in shapes.items():
    outline_png(mask, OUT / f'{name}.png')
    h = np.any(mask, axis=1).sum(); w = np.any(mask, axis=0).sum()
    print(f'{name:14} 外接 {w}x{h}  比 {max(w,h)/min(w,h):.2f}  面積率 {mask.sum()/(w*h):.2f}')
