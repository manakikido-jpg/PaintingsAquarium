#!/usr/bin/env python3
"""印刷して子どもに渡す台紙を作る。

    python3 tools/make-sheets.py

A4・300dpi。上にテーマの題を入れ、その下に生き物を大きく置く。

  docs/お絵かき水族館-台紙.pdf     ← **これを印刷する**（6ページ）
  docs/お絵かきダイナソー-台紙.pdf ← **これを印刷する**（5ページ）
  sheets/<テーマ>/<種類>.png       1枚ずつ要るとき（リポジトリには入れない）

台紙を1枚でも差し替えたら、この道具を通し直すこと。

**外枠は描かない。** 切り抜きは「画像の外から届く白」だけを消すので、
枠が写ると枠の内側が丸ごと1つの塊になり、泳ぐのは絵ではなく紙の四角になる。
しかも全種が同じ四角なので照合も全滅する（`docs/台紙の作り方.md`）。

**名前を書く欄も作らない。** 個人情報は持たない（`docs/要件定義.md` §5）。

**題の文字は取り込みで落ちる。** 切り抜きのあと、面積が画像の 5% 未満の塊は
捨てられる（`keepMainRegions` の `minAreaRatio`）。文字1つは 0.1% ほどしかない。
絵から十分離してあるので、はみ出して塗ってもつながらない。
**これは実測で確かめること**（下の「確かめ方」）。

**紙の向きは全種そろえて A4 よこ。** 会場で刷る設定を1つにするため。

絵ごとに向きを変えれば1枚ずつは大きく刷れるが、1つの PDF に縦と横が混ざる。
そろえるならどちらかだが、実測すると差がはっきりしていた（使える面積の合計）。

    水族館6種   たて 161 / よこ 148   たてが 1.09 倍
    恐竜5種     たて 110 / よこ 158   よこが 1.44 倍

恐竜は横長ばかりで、たてに統一すると**アンキロサウルスが 182×86mm の細い帯**になり、
紙の下半分が白く余る。よこに統一したときの水族館の損は 9% しかない。
一番狭くなるのはクラゲ（74×147mm）だが、もともと縦に細い絵なので塗る面積は足りる。

確かめ方:

    python3 tools/make-sheets.py /tmp/sheets
    python3 tools/make-sample-scans.py /tmp/scans      # 塗った紙の見本
    # 取り込みフォルダに置いて、種類が正しく付くか見る
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DPI = 300


def mm(value: float) -> int:
    return round(value / 25.4 * DPI)


# A4。**全種これで統一する**（上の説明）。縦に戻すなら PAGE を入れ替える
A4_PORTRAIT = (mm(210), mm(297))
A4_LANDSCAPE = (mm(297), mm(210))
PAGE = A4_LANDSCAPE
# 紙の端。ふちなし印刷でないと刷れないので、余裕を持たせる
MARGIN = mm(14)
# 題の下に空ける幅。**ここを詰めない。**
# 詰めると、はみ出して塗った色が題につながり、文字ごと絵として拾われる
TITLE_GAP = mm(9)

FONT = '/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf'
# 線と同じ濃さ。薄くすると印刷でかすれる
TEXT = (30, 28, 28)

THEMES = {
    'aquarium': {
        'title': 'お絵かき水族館',
        'lead': 'すきな いろで ぬってね',
        'folder': ROOT / 'assets/templates',
        'pdf': 'お絵かき水族館-台紙.pdf',
    },
    'dinosaur': {
        'title': 'お絵かきダイナソー',
        'lead': 'すきな いろで ぬってね',
        'folder': ROOT / 'assets/templates/dinosaur',
        'pdf': 'お絵かきダイナソー-台紙.pdf',
    },
}


def fitted(font_path: str, text: str, width: int, cap: int) -> ImageFont.FreeTypeFont:
    """幅に収まる一番大きい字。題の長さがテーマで違うので、字数で決め打ちしない。"""
    size = cap
    while size > 8:
        font = ImageFont.truetype(font_path, size)
        if font.getbbox(text)[2] <= width:
            return font
        size -= 2
    return ImageFont.truetype(font_path, 8)


def sheet(art_path: Path, title: str, lead: str) -> Image.Image:
    art = Image.open(art_path).convert('L')
    # 台紙は白地に黒線。余白を詰めてから置き直す（元の余白の量に左右されないため）
    trimmed = art.point(lambda v: 0 if v < 250 else 255)
    bbox = trimmed.point(lambda v: 255 - v).getbbox()
    if bbox:
        art = art.crop(bbox)

    page = Image.new('L', PAGE, 255)
    pen = ImageDraw.Draw(page)

    inner = page.width - MARGIN * 2
    # よこ向きは高さが 210mm しかない。題を大きく取りすぎると絵が痩せる
    title_font = fitted(FONT, title, inner, mm(16))
    lead_font = fitted(FONT, lead, inner, mm(7))

    y = MARGIN
    for text, font in ((title, title_font), (lead, lead_font)):
        left, top, right, bottom = font.getbbox(text)
        pen.text(((page.width - (right - left)) // 2 - left, y - top), text, font=font, fill=TEXT[0])
        y += bottom - top + mm(4)

    top_of_art = y + TITLE_GAP
    space_w = inner
    space_h = page.height - MARGIN - top_of_art
    scale = min(space_w / art.width, space_h / art.height)
    drawn = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.LANCZOS)
    page.paste(
        drawn,
        ((page.width - drawn.width) // 2, top_of_art + (space_h - drawn.height) // 2),
    )
    return page


def main() -> int:
    # PNG は作り直せるのでリポジトリに入れない。PDF だけ docs に置く
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'sheets')
    made = 0
    for theme, spec in THEMES.items():
        target = out / theme
        target.mkdir(parents=True, exist_ok=True)
        pages = []
        for path in sorted(spec['folder'].glob('*.png')):
            page = sheet(path, spec['title'], spec['lead'])
            page.save(target / f'{path.stem}.png', dpi=(DPI, DPI))
            pages.append(page)
            made += 1
            print(f'  {theme}/{path.stem}.png  {page.width}x{page.height}')
        if pages:
            pdf = (ROOT / 'docs' if out == ROOT / 'sheets' else out) / spec['pdf']
            pages[0].save(
                pdf,
                save_all=True,
                append_images=pages[1:],
                resolution=DPI,
                title=spec['title'],
            )
            print(f'  → {pdf.name}  {len(pages)} ページ  {pdf.stat().st_size / 1024 / 1024:.1f}MB')

    print(f'\n{made} 枚を書き出した（PNG は {out}）')
    print('印刷は A4・等倍（「用紙に合わせる」を切る）。ふちなしは要らない。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
