#!/usr/bin/env python3
"""動物園6種をA4横・左上タイトルで書き出す。既定70%、縮小版は引数で別PDFに出せる。"""
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
    parser.add_argument('--art-scale', type=float, default=0.7)
    parser.add_argument('--giraffe-scale', type=float, default=None)
    parser.add_argument('--title-mm', type=int, default=9)
    parser.add_argument('--lead-mm', type=int, default=4)
    parser.add_argument('--pdf', type=Path, default=ROOT/'docs/お絵描き動物園-台紙.pdf')
    args = parser.parse_args()
    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    pages = []
    for path in sorted((ROOT / 'assets/templates/zoo').glob('*.png')):
        # 縦長のキリンは同じ高さでも塗る面が小さいため、個別の倍率を使えるようにする。
        scale = args.giraffe_scale if path.stem.endswith('_kirin') and args.giraffe_scale is not None else args.art_scale
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
