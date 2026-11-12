#!/usr/bin/env python3
"""動物園6種をA4横・左上タイトルで書き出す。既定は最新の大きめ版。全種共通・個別倍率も引数で指定できる。"""
import argparse
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('sheets', ROOT / 'tools/make-sheets.py')
sheets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sheets)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', nargs='?', type=Path, default=ROOT/'sheets/zoo')
    parser.add_argument('--art-scale', type=float, default=None, help='全種共通の倍率。未指定なら最新の種別倍率を使う')
    parser.add_argument('--giraffe-scale', type=float, default=None)
    parser.add_argument('--zebra-scale', type=float, default=None)
    parser.add_argument('--title-mm', type=int, default=7)
    parser.add_argument('--lead-mm', type=int, default=3)
    parser.add_argument('--pdf', type=Path, default=ROOT/'docs/お絵描き動物園-台紙.pdf')
    args = parser.parse_args()
    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    pages = []
    for path in sorted((ROOT / 'assets/templates/zoo').glob('*.png')):
        # 形によって塗る面の広さが違うため、指定した動物だけ倍率を変える。
        species = path.stem.split('_', 1)[-1]
        latest = {'kirin': 0.99, 'shimauma': 0.78}
        # 共通倍率を明示した既存の呼び出しは、全種同倍率のまま再生成できる。
        base = 0.75 if args.art_scale is None else args.art_scale
        scale = latest.get(species, base) if args.art_scale is None else base
        override = {'kirin': args.giraffe_scale, 'shimauma': args.zebra_scale}.get(species)
        if override is not None:
            scale = override
        page = sheets.sheet(path, 'お絵描き動物園', 'すきな いろで ぬってね', title_left=True, title_cap_mm=args.title_mm, lead_cap_mm=args.lead_mm, art_scale=scale)
        page.save(out / path.name, dpi=(sheets.DPI, sheets.DPI))
        pages.append(page.convert('RGB'))
    if len(pages) != 6:
        raise SystemExit('動物園の台紙は6種類必要です')
    pdf = args.pdf
    pdf.parent.mkdir(parents=True, exist_ok=True)
    pages[0].save(pdf, save_all=True, append_images=pages[1:], resolution=sheets.DPI,
                  title='お絵描き動物園')
    print(f'{pdf}: A4横・6ページ。印刷は等倍、片面。')


if __name__ == '__main__':
    main()
