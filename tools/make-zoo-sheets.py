#!/usr/bin/env python3
"""動物園6種だけをA4横・70%・左上タイトルで書き出す。既存の台紙は更新しない。"""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('sheets', ROOT / 'tools/make-sheets.py')
sheets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sheets)


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'sheets/zoo'
    out.mkdir(parents=True, exist_ok=True)
    pages = []
    for path in sorted((ROOT / 'assets/templates/zoo').glob('*.png')):
        page = sheets.sheet(path, 'お絵描き動物園', 'すきな いろで ぬってね', title_left=True, title_cap_mm=9, lead_cap_mm=4)
        page.save(out / path.name, dpi=(sheets.DPI, sheets.DPI))
        pages.append(page.convert('RGB'))
    if len(pages) != 6:
        raise SystemExit('動物園の台紙は6種類必要です')
    pdf = ROOT / 'docs/お絵描き動物園-台紙.pdf'
    pages[0].save(pdf, save_all=True, append_images=pages[1:], resolution=sheets.DPI,
                  title='お絵描き動物園')
    print(f'{pdf}: A4横・6ページ。印刷は等倍、片面。')


if __name__ == '__main__':
    main()
