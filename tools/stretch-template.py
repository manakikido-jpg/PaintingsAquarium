#!/usr/bin/env python3
"""台紙を縦（または横）に引き伸ばす。**形を離すためだけに使う。**

**なぜ要るのか** — 照合は外形の重なりしか見ず、回転も反転も全部試すので、
見分けの材料は「**長辺と短辺の比**」と「出っぱり」しかない。
比の近い台紙が2枚あると、絵の出来に関係なく見分けが落ちる。

比は**描き直さなくても変えられる**。クラゲも同じ理由で縦に伸ばしてある。
絵の印象は意外と変わらない（おばけは縦に伸ばすほどおばけらしくなる）。

**伸ばしたものが印刷する台紙になる。** 照合に使う形と、子どもが塗る紙が
違っていては意味がないので、元の絵のほうを刷ってはいけない。
元は `assets/templates/source/` に残す。

使い方:
    python3 tools/stretch-template.py <入力.png> <出力.png> --y 1.4
    python3 tools/stretch-template.py <入力.png> <出力.png> --x 1.3
"""
import argparse
from pathlib import Path

from PIL import Image

# これより明るければ白。伸ばすと線がぼけるので、二値に戻す境目
INK = 150


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('source', type=Path)
    ap.add_argument('output', type=Path)
    ap.add_argument('--x', type=float, default=1.0)
    ap.add_argument('--y', type=float, default=1.0)
    a = ap.parse_args()

    image = Image.open(a.source).convert('L')
    w, h = image.size
    # 伸ばしてから二値に戻す。灰色の縁が残ると「線が薄い」と判定される
    tall = image.resize((round(w * a.x), round(h * a.y)), Image.LANCZOS)
    tall = tall.point(lambda v: 0 if v < INK else 255)

    # 紙は正方形のまま。伸びたぶんだけ余白が減る
    side = max(w, h, tall.width, tall.height)
    sheet = Image.new('L', (side, side), 255)
    sheet.paste(tall, ((side - tall.width) // 2, (side - tall.height) // 2))
    a.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(a.output)
    print(f'{a.source.name} {w}x{h} → {a.output.name} {side}x{side}（縦 {a.y} 倍・横 {a.x} 倍）')


if __name__ == '__main__':
    main()
