#!/usr/bin/env python3
"""
恐竜テーマの背景パーツを、一覧画像から切り出して名前をつける。

    python3 tools/prep-dino-parts.py

`tools/split-parts.py` がやるのは「切り出し」までで、出てくるのは
`part-01.png` のような連番。恐竜の背景は**種類ごとに置き方が違う**ため
（岩は奥の地面、草は手前、火山は遠景）、連番のままでは使えない。
ここで種類ごとの名前に振り直す。

**恐竜そのもの（T-Rex・トリケラトプス・ブロントサウルス）は入れない。**
このアプリで泳ぐ（歩く）のは子どもが塗った恐竜であって、背景に出来合いの
恐竜を置くと、自分の絵を探す邪魔になる。同じ理由で、絵より目立つものは置かない。

一覧画像の読み順（左上→右下）に依存しているので、**一覧画像を差し替えたら
この対応表も作り直すこと。** 個数が変わったら止まるようにしてある。
"""
import importlib.util
import os
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'assets/decor/source/dino-sheet.png')
OUT = os.path.join(ROOT, 'assets/decor/dinosaur')

# 一覧画像から切り出したときの個数。ここが変わったら対応表が合っていない
EXPECTED = 40

# 切り出した番号 → つける名前。番号は一覧画像の読み順（1 始まり）
GROUPS = {
    'rock': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],   # 大きな岩・台地。奥の地面に置く
    'tree': [13, 14, 15],                              # ヤシ2本と広葉樹
    'plant': list(range(16, 33)),                      # シダ・草。手前に置く
    'volcano': [34],                                   # 遠景に1つ
    'find': [35, 36, 38],                              # 卵・化石・骨。足元の小物
}
# 使わないもの（理由つき）
SKIP = {
    33: '火山3つが煙でつながって1枚になっている。単体の 34 を使う',
    37: '恐竜（T-Rex）。子どもの絵と競合するので背景には置かない',
    39: '恐竜（ブロントサウルス）。同上',
    40: '恐竜（トリケラトプス）。同上',
}


def load_splitter():
    path = os.path.join(ROOT, 'tools/split-parts.py')
    spec = importlib.util.spec_from_file_location('split_parts', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    if not os.path.exists(SOURCE):
        print(f'一覧画像がない: {SOURCE}')
        return 1

    splitter = load_splitter()
    with tempfile.TemporaryDirectory() as work:
        argv = sys.argv
        sys.argv = ['split-parts.py', SOURCE, work]
        try:
            splitter.main()
        finally:
            sys.argv = argv
        cut = sorted(f for f in os.listdir(work) if f.startswith('part-'))
        if len(cut) != EXPECTED:
            print(f'\n切り出しの個数が変わった（{len(cut)} 個。想定は {EXPECTED} 個）。')
            print('一覧画像を差し替えたなら、このファイルの GROUPS / SKIP を作り直すこと。')
            return 1

        # 作り直しなので、前の出力は消してから書く。
        # 残しておくと、名前が変わったときに古い PNG が背景として読み込まれ続ける
        if os.path.isdir(OUT):
            shutil.rmtree(OUT)
        os.makedirs(OUT, exist_ok=True)

        written = 0
        for group, numbers in GROUPS.items():
            for order, number in enumerate(numbers, start=1):
                name = f'{group}-{order:02d}.png'
                shutil.copyfile(os.path.join(work, f'part-{number:02d}.png'), os.path.join(OUT, name))
                written += 1
            print(f'{group}: {len(numbers)} 個')

    for number, why in SKIP.items():
        print(f'使わない part-{number:02d}: {why}')
    print(f'\n{written} 個を書き出した → {OUT}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
