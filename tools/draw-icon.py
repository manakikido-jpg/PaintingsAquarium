#!/usr/bin/env python3
"""
小さいサイズ用のアイコンを描く。

    python3 tools/draw-icon.py [--sheet]

**元絵を縮めたものではない。** 元絵には筆・パレット・泡・珊瑚・絵の具のしぶきが
入っていて、16px（タスクバー）まで縮めると何だか分からない色の塊になる。
小さいサイズは**描き直す**しかない。

残したのは3つだけ。
  ・角の丸い札（薄い水色の水彩）
  ・まる魚ひとつ（画面の7割）
  ・こげ茶の太い輪郭

色は元絵に合わせてある。タスクバー（小）とデスクトップ（大）で
別のアプリに見えると困るため。

    python3 tools/draw-icon.py --ico     build/icon.ico を作る（配布に使う）
    python3 tools/draw-icon.py --ico --large build/icon.png
                                        大きいほうだけ別の絵を使う
    python3 tools/draw-icon.py --sheet   確認用の絵を出す（build/preview/）

**16px は必ず等倍で見ること。** 拡大して見ると潰れているのが分からない。
灰色ににじんだ目も、輪郭が消えているのも、等倍で初めて分かった。

大きいサイズ（64px 以上）には、本番の絵を差し込める。手順は2つ。

    python3 tools/make-icon.py assets/icon-source.png   # 机の木目を落とす
    python3 tools/draw-icon.py --ico --large build/icon.png

小さいほうはそれでも**描いたまま**にする。縮めると読めないのが理由なので、
元絵が良くなっても事情は変わらない。

electron-builder は `build/icon.ico` があればそれをそのまま使う
（`directories.buildResources: build` のため）。設定に書き足す必要は無い。
"""
import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'build'

# 元絵から拾った色
PAPER = (250, 248, 242, 255)
WATER = (176, 214, 232, 255)
INK = (74, 46, 26, 255)
BODY = (243, 178, 42, 255)
BODY_WARM = (232, 126, 40, 255)
BAND = (58, 122, 196, 255)
WHITE = (255, 255, 255, 255)

# 何倍で描いてから縮めるか。輪郭のギザギザを消すため
SUPER = 8


def draw(side: int) -> Image.Image:
    """1枚描く。

    **大きさによって描くものを変える。** 同じ絵を縮めても 16px は読めない。
    紙の縁・縞・背びれは、小さいほど「1〜2画素の汚れ」にしかならないので落とす。
    残すのは、その大きさでも形が分かるものだけ。
    """
    # 紙の縁は 32px 未満だと 1画素で、白い枠にしか見えない。中の水を広く取る
    rim = side >= 32
    # 縞は 24px 未満だと胴の色を濁らせるだけ
    bands = side >= 24
    # 背びれは 32px 未満だと胴の上の点になる
    dorsal = side >= 32

    size = side * SUPER
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    pen = ImageDraw.Draw(image)

    def box(x0, y0, x1, y1):
        return [x0 * size, y0 * size, x1 * size, y1 * size]

    def line(width):
        return max(1, round(width * size))

    radius = size * 0.22
    if rim:
        pen.rounded_rectangle(box(0, 0, 1, 1), radius=radius, fill=PAPER)
        pen.rounded_rectangle(box(0.05, 0.05, 0.95, 0.95), radius=radius * 0.78, fill=WATER)
        frame = (0.05, 0.95)
    else:
        pen.rounded_rectangle(box(0, 0, 1, 1), radius=radius, fill=WATER)
        frame = (0.0, 1.0)

    # 枠いっぱいに魚を置く。紙の縁がある大きさでは、その内側に収める
    span = frame[1] - frame[0]

    def at(x: float, y: float) -> tuple[float, float]:
        return (frame[0] + x * span) * size, (frame[0] + y * span) * size

    def rect(x0, y0, x1, y1):
        a, b = at(x0, y0)
        c, d = at(x1, y1)
        return [a, b, c, d]

    # 輪郭は小さいほど太く。細いままだと消えて、胴が背景に溶ける
    edge = line(0.030 if side >= 32 else 0.055)

    if dorsal:
        # 背びれ。**胴より先に描く。** あとから胴を重ねれば根元の継ぎ目が隠れる
        pen.polygon(
            [at(0.36, 0.30), at(0.58, 0.07), at(0.68, 0.30)],
            fill=BODY_WARM,
            outline=INK,
            width=edge,
        )

    # 尾。扇形。先を広く取らないと、小さい大きさで棘に見える
    pen.polygon(
        [at(0.30, 0.51), at(0.03, 0.24), at(0.11, 0.51), at(0.03, 0.78)],
        fill=BODY_WARM,
        outline=INK,
        width=edge,
    )

    # 胴。まる魚。枠の 8割 を占める
    pen.ellipse(rect(0.17, 0.22, 0.92, 0.83), fill=BODY, outline=INK, width=edge)

    if bands:
        stripes = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        ink = ImageDraw.Draw(stripes)
        ink.ellipse(rect(0.27, 0.225, 0.40, 0.825), fill=BAND)
        ink.ellipse(rect(0.47, 0.225, 0.56, 0.825), fill=BODY_WARM)
        hole = Image.new('L', (size, size), 0)
        ImageDraw.Draw(hole).ellipse(rect(0.175, 0.225, 0.915, 0.825), fill=255)
        stripes.putalpha(Image.composite(stripes.split()[3], Image.new('L', (size, size), 0), hole))
        image.alpha_composite(stripes)
        pen.ellipse(rect(0.17, 0.22, 0.92, 0.83), outline=INK, width=edge)

    # 目。**これが消えると魚に見えない。**
    #
    # 白目の輪の中に黒目、という描き方は 32px 以下で**灰色のにじみ**になる。
    # 白と黒が同じ画素に混ざって平均されるため。実際に等倍で見て分かった。
    # 小さいうちは**濃い一点**にする。輪郭に触れないよう、胴の内側へ寄せる。
    # どの大きさでも**濃い一点**を土台にする。白目の輪を描くのは 64px 以上でも
    # 「@」のように見えたので、光の点だけを小さく足すに留めた。
    pen.ellipse(rect(0.66, 0.37, 0.79, 0.51), fill=INK)
    if side >= 64:
        pen.ellipse(rect(0.685, 0.395, 0.720, 0.435), fill=WHITE)

    return image.resize((side, side), Image.LANCZOS)


def pack_ico(images: list[Image.Image]) -> bytes:
    """複数の絵を1つの .ico にまとめる。

    PIL の ICO 保存は**1枚の絵を縮めて全サイズを作る**ので使えない。
    ここでやりたいのは逆で、大きさごとに**別の絵**を入れること。

    書式は単純で、見出し（6バイト）＋大きさごとの索引（16バイトずつ）＋
    PNG の中身をそのまま並べるだけ。Windows 7 以降は中身が PNG でよい。
    """
    from io import BytesIO

    blobs = []
    for image in images:
        buffer = BytesIO()
        image.save(buffer, format='PNG')
        blobs.append(buffer.getvalue())

    # 見出し: 予約(0) / 種類(1=アイコン) / 枚数
    head = struct.pack('<HHH', 0, 1, len(images))
    offset = len(head) + 16 * len(images)
    index = b''
    for image, blob in zip(images, blobs):
        side = image.width
        index += struct.pack(
            '<BBBBHHII',
            # 256 は 0 で表す（1バイトに収まらないため）
            0 if side >= 256 else side,
            0 if side >= 256 else side,
            0,  # 色数（フルカラーは 0）
            0,  # 予約
            1,  # 面数
            32,  # 1画素あたりのビット数
            len(blob),
            offset,
        )
        offset += len(blob)
    return head + index + b''.join(blobs)


def main() -> int:
    # Windows が実際に引く大きさ。48 まではタスクバーと一覧、それ以上は大アイコン
    sizes = [16, 24, 32, 48, 64, 128, 256]
    # ここから上は、渡された絵があればそちらを使う
    LARGE_FROM = 64

    large = None
    if '--large' in sys.argv:
        path = Path(sys.argv[sys.argv.index('--large') + 1])
        large = Image.open(path).convert('RGBA')
        if large.width != large.height:
            print(f'{path} が正方形でない（{large.size}）。make-icon.py の出力を渡すこと')
            return 1

    def one(side: int) -> Image.Image:
        if large is not None and side >= LARGE_FROM:
            return large.resize((side, side), Image.LANCZOS)
        return draw(side)

    if '--ico' in sys.argv:
        OUT.mkdir(parents=True, exist_ok=True)
        target = OUT / 'icon.ico'
        target.write_bytes(pack_ico([one(side) for side in sizes]))
        # 書けたものを読み返して確かめる。書式を手で組んでいるので、
        # 「保存できた」だけでは Windows が読めるかどうか分からない
        with Image.open(target) as check:
            got = sorted(check.info['sizes'])
        print(f'{target.relative_to(ROOT)}  {target.stat().st_size / 1024:.0f}KB  {got}')
        if got != sorted((side, side) for side in sizes):
            print('  ← 入れた大きさと読み返した大きさが違う')
            return 1

    if '--sheet' in sys.argv:
        preview = OUT / 'preview'
        preview.mkdir(parents=True, exist_ok=True)
        for side in sizes:
            one(side).save(preview / f'{side}.png')

        # 等倍で並べる。拡大した絵だけ見て「読める」と判断すると必ず外す
        pad, gap = 24, 24
        width = pad * 2 + sum(sizes) + gap * (len(sizes) - 1)
        sheet = Image.new('RGBA', (width, max(sizes) + pad * 2), (245, 245, 245, 255))
        x = pad
        for side in sizes:
            sheet.alpha_composite(one(side), (x, pad + (max(sizes) - side) // 2))
            x += side + gap
        sheet.save(preview / 'sheet.png')

        # 等倍だけだと画素が見えないので、拡大した並びも一緒に出す
        zoom = [one(side).resize((side * 10, side * 10), Image.NEAREST) for side in sizes if side <= 64]
        wide = sum(one.width for one in zoom) + gap * (len(zoom) + 1)
        tall = max(one.height for one in zoom) + gap * 2
        board = Image.new('RGBA', (wide, tall), (245, 245, 245, 255))
        x = gap
        for one in zoom:
            board.alpha_composite(one, (x, gap))
            x += one.width + gap
        board.save(preview / 'zoom.png')
        print(f'{preview.relative_to(ROOT)}/sheet.png（等倍）  zoom.png（10倍・画素を見る用）')

    if '--ico' not in sys.argv and '--sheet' not in sys.argv:
        print(__doc__)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
