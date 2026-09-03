#!/usr/bin/env python3
"""台紙に色を塗った「取り込み用の見本」を作る。

    python3 tools/make-sample-scans.py 出力先フォルダ [枚数]
    python3 tools/make-sample-scans.py 出力先フォルダ [枚数] --sheets <印刷用台紙のフォルダ>

**何のために要るのか**

会場の紙が手に入るまで、取り込み〜表示を通しで試す材料が無い。
線画の台紙をそのまま通すこともできるが、それでは
「色を塗った紙がちゃんと抜けるか」「塗った絵でも台紙を見分けられるか」が試せない。

ここで作るのは**スキャナで取り込んだ体裁の A4 300dpi の画像**で、
取り込みフォルダにそのまま置ける。デモや、会場PCの受け入れ確認にも使う。

**本物の紙の代わりにはならない。** 紙の色・影・クレヨンの粉は再現していないので、
切り抜きのしきい値は実物で測り直すこと（`docs/やること.md` T-4）。

作るもの（1種類につき `count` 枚）
  - 線の内側を、その生き物らしい色で塗る
  - クレヨンのムラ（低い周波数のゆらぎ）と、白い塗り残しを入れる
  - 2枚目以降は**線からはみ出して塗る**。子どもの塗り方に近く、切り抜きの試験になる

`--sheets` を付けると、`tools/make-sheets.py` が作った**題入りの台紙**を塗る。
**題の文字が取り込みで落ちるかを確かめるのは、これでしかできない。**
題は絵ではないので、拾われると外接矩形が紙の上端まで伸びて、泳ぐ絵が縦に潰れる。
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
# A4・300dpi。会場のスキャナの設定に合わせてある
PAGE = (2480, 3508)
# 紙の色。真っ白にすると、実物より切り抜きが簡単になってしまう
PAPER = (252, 251, 247)
# 線とみなす暗さ
INK = 140

# 生き物ごとの色。**塗り絵なので彩度は高め**にしてある
PALETTES = {
    '01_sakana_A_marusakana': [(245, 152, 42), (250, 205, 70), (238, 108, 60), (255, 230, 140)],
    '03_tako': [(232, 92, 140), (250, 150, 180), (200, 70, 120), (255, 200, 215)],
    '04_iruka': [(96, 168, 224), (150, 205, 240), (60, 130, 190), (225, 240, 250)],
    '05_same': [(120, 150, 175), (170, 195, 215), (85, 115, 145), (240, 245, 250)],
    '06_kurage': [(178, 130, 220), (215, 175, 245), (140, 95, 195), (240, 225, 255)],
    '07_umigame': [(88, 175, 110), (140, 205, 130), (60, 140, 85), (245, 215, 110)],
    '11_pteranodon': [(90, 190, 190), (150, 220, 215), (240, 160, 80), (230, 245, 240)],
    '12_ankylosaurus': [(120, 175, 95), (165, 205, 130), (150, 120, 80), (230, 215, 170)],
    '13_brontosaurus': [(110, 160, 215), (160, 200, 235), (90, 190, 175), (235, 245, 250)],
    '14_stegosaurus': [(235, 150, 70), (120, 175, 110), (250, 200, 110), (200, 130, 60)],
    '15_triceratops': [(245, 200, 80), (190, 210, 110), (230, 150, 70), (250, 230, 170)],
}
DEFAULT_PALETTE = [(230, 150, 90), (150, 200, 220), (200, 170, 220), (240, 220, 130)]


def inside_mask(ink: np.ndarray) -> np.ndarray:
    """線の内側（外から届かない白）。塗ってよい範囲。"""
    height, width = ink.shape
    flood = Image.new('L', (width + 2, height + 2), 0)
    flood.paste(Image.fromarray((ink * 255).astype('uint8')), (1, 1))
    ImageDraw.floodfill(flood, (0, 0), 128)
    return np.asarray(flood)[1 : height + 1, 1 : width + 1] != 128


def crayon(shape, rng, strength=0.16):
    """クレヨンのムラ。低い周波数のゆらぎ＋細い塗り残し。"""
    rough = ndimage.gaussian_filter(rng.random(shape), 9)
    rough = (rough - rough.min()) / max(1e-6, float(rough.max() - rough.min()))
    # 斜めの塗り残し。真っ平らに塗ると印刷物に見える
    ys, xs = np.indices(shape)
    streak = ((ys + xs * 1.7) % 23 < 2).astype(float) * 0.35
    return 1 - strength * rough - streak * 0.12


def paint(path: Path, rng, spill: int) -> Image.Image:
    art = Image.open(path).convert('L')
    art.thumbnail((1800, 1800), Image.LANCZOS)
    grey = np.asarray(art)
    ink = grey < INK
    inside = inside_mask(ink)

    palette = PALETTES.get(path.stem, DEFAULT_PALETTE)
    canvas = np.full((*grey.shape, 3), PAPER, dtype=float)

    labels, count = ndimage.label(inside & ~ink)
    order = sorted(range(1, count + 1), key=lambda i: -(labels == i).sum())
    painted = np.zeros(grey.shape, dtype=bool)
    for rank, region in enumerate(order):
        area = labels == region
        if area.sum() < 150:
            continue
        colour = np.array(palette[rank % len(palette)], dtype=float)
        # 同じ色でも1区画ごとに少し振る。全部同じだと塗り絵に見えない
        colour = np.clip(colour * (1 + rng.uniform(-0.09, 0.09)), 0, 255)
        if spill:
            # **線からはみ出して塗る。** 子どもの塗り方に近く、切り抜きの試験になる
            area = ndimage.binary_dilation(area, iterations=spill)
        canvas[area] = colour
        painted |= area

    # **ムラは塗った所にだけ掛ける。**
    # 画面全体に掛けると、絵の周りの紙まで暗くなって「灰色の板」に見える
    shade = crayon(grey.shape, rng)
    canvas[painted] *= shade[painted][:, None]
    canvas[ink] = (28, 26, 26)

    page = Image.new('RGB', PAGE, PAPER)
    # 紙のざらつき。真っ平らな白は実物では出ない
    grain = Image.fromarray(
        np.clip(np.asarray(page, dtype=float) + rng.normal(0, 1.6, (*PAGE[::-1], 3)), 0, 255).astype('uint8')
    )
    picture = Image.fromarray(np.clip(canvas, 0, 255).astype('uint8'))
    grain.paste(picture, ((PAGE[0] - picture.width) // 2, (PAGE[1] - picture.height) // 2))
    return grain.filter(ImageFilter.GaussianBlur(0.4))


def paint_sheet(path: Path, rng, spill: int) -> Image.Image:
    """**題の入った台紙**をそのまま塗る。紙の大きさも配置も変えない。

    こちらは絵を置き直さない。印刷して配る紙と同じ配置のまま塗るので、
    「題が取り込みで落ちるか」をそのまま試せる。
    """
    art = Image.open(path).convert('L')
    grey = np.asarray(art)
    ink = grey < INK
    inside = inside_mask(ink)

    palette = PALETTES.get(path.stem, DEFAULT_PALETTE)
    canvas = np.full((*grey.shape, 3), PAPER, dtype=float)

    labels, count = ndimage.label(inside & ~ink)
    order = sorted(range(1, count + 1), key=lambda i: -(labels == i).sum())
    painted = np.zeros(grey.shape, dtype=bool)
    for rank, region in enumerate(order):
        area = labels == region
        # 文字の内側（「お」の穴など）は塗らない。紙の面積に対して小さすぎる
        if area.sum() < grey.size * 0.0008:
            continue
        colour = np.clip(np.array(palette[rank % len(palette)], dtype=float) * (1 + rng.uniform(-0.09, 0.09)), 0, 255)
        if spill:
            area = ndimage.binary_dilation(area, iterations=spill)
        canvas[area] = colour
        painted |= area

    shade = crayon(grey.shape, rng)
    canvas[painted] *= shade[painted][:, None]
    canvas[ink] = (28, 26, 26)

    page = Image.fromarray(np.clip(canvas, 0, 255).astype('uint8'))
    noisy = np.clip(np.asarray(page, dtype=float) + rng.normal(0, 1.6, (*page.size[::-1], 3)), 0, 255)
    return Image.fromarray(noisy.astype('uint8')).filter(ImageFilter.GaussianBlur(0.4))


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out = Path(args[0] if args else 'sample-scans')
    count = int(args[1]) if len(args) > 1 else 2

    if '--sheets' in sys.argv:
        sheets = Path(sys.argv[sys.argv.index('--sheets') + 1])
        made = 0
        for theme in ('aquarium', 'dinosaur'):
            target = out / theme
            target.mkdir(parents=True, exist_ok=True)
            for path in sorted((sheets / theme).glob('*.png')):
                for index in range(count):
                    rng = np.random.default_rng(abs(hash(path.stem)) % 9973 + index * 101)
                    page = paint_sheet(path, rng, spill=0 if index == 0 else 2 + index)
                    name = f'{path.stem}-{index + 1}.jpg'
                    page.save(target / name, quality=92, subsampling=0)
                    made += 1
                    print(f'  {theme}/{name}')
        print(f'\n{made} 枚を書き出した（題入りの台紙を塗ったもの）→ {out}')
        return 0

    made = 0
    for theme, folder in (('aquarium', ROOT / 'assets/templates'), ('dinosaur', ROOT / 'assets/templates/dinosaur')):
        target = out / theme
        target.mkdir(parents=True, exist_ok=True)
        for path in sorted(folder.glob('*.png')):
            for index in range(count):
                rng = np.random.default_rng(abs(hash(path.stem)) % 9973 + index * 101)
                # 1枚目はきれいに、2枚目以降ははみ出して塗る
                page = paint(path, rng, spill=0 if index == 0 else 2 + index)
                # **JPEG で出す。** 実際のスキャナの既定もたいてい JPEG で、
                # 紙のざらつきを入れた PNG は 1枚 9MB になって配れない
                name = f'{path.stem}-{index + 1}.jpg'
                page.save(target / name, quality=92, subsampling=0)
                made += 1
                print(f'  {theme}/{name}')

    print(f'\n{made} 枚を書き出した → {out}')
    print('取り込みフォルダにそのまま置ける（A4 300dpi・JPEG）。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
