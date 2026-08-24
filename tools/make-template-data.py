#!/usr/bin/env python3
"""台紙の形を、アプリが読める升目データに変換する。

なぜ生成するのか
----------------
照合に要るのは 48×48 の白黒だけで、PNG そのものではない。
**実行時に画像を読まない**ようにしておけば、取り込みの途中で
読み込み待ちが入らず、テストも画像ファイル無しで書ける。

計算は `tools/check-templates.py` と同じで、
`src/core/match.ts` の `silhouette()` を写したもの。
**数字がずれたら match.ts が正**。あちらを直したらこちらも直す。

使い方:
    python3 tools/make-template-data.py assets/templates src/core/templates.generated.ts
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import importlib.util

spec = importlib.util.spec_from_file_location('check_templates', Path(__file__).parent / 'check-templates.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)

# ファイル名 → アプリの中での種類
SPECIES = {
    # 水族館
    '01_sakana_A_marusakana': 'fish',
    '03_tako': 'tako',
    '04_iruka': 'iruka',
    '05_same': 'same',
    '06_kurage': 'kurage',
    '07_umigame': 'umigame',
    # 恐竜（assets/templates/dinosaur/）
    '11_pteranodon': 'pteranodon',
    '12_ankylosaurus': 'ankylosaurus',
    '13_brontosaurus': 'brontosaurus',
    '14_stegosaurus': 'stegosaurus',
    '15_triceratops': 'triceratops',
}


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else 'assets/templates')
    out = Path(sys.argv[2] if len(sys.argv) > 2 else 'src/core/templates.generated.ts')

    entries = []
    # 台紙はテーマごとにフォルダを分けてあるので、下の階層まで見る。
    # `source/`（外枠つきの元画像）は拾わない
    for path in sorted(p for p in src.rglob('*.png') if 'source' not in p.parts):
        species = SPECIES.get(path.stem)
        if not species:
            print(f'{path.name}: 種類が分からないので飛ばす（tools/make-template-data.py の SPECIES に足す）')
            continue
        mask, ink, filled = check.load_silhouette_mask(path)
        if ink and filled / ink < check.CLOSED_RATIO:
            raise SystemExit(f'{path.name}: 輪郭が閉じていません。台紙を作り直してください')
        cells, width, height = check.to_cells(mask)
        if cells is None:
            raise SystemExit(f'{path.name}: 中身がありません')
        bits = ''.join('1' if cell else '0' for cell in cells)
        entries.append((species, path.name, bits, round(max(width, height) / min(width, height), 2)))
        print(f'{path.name} → {species}  比 {max(width,height)/min(width,height):.2f} : 1')

    lines = [
        '/*',
        ' * 自動生成。手で編集しない。',
        ' * `python3 tools/make-template-data.py assets/templates src/core/templates.generated.ts`',
        ' *',
        ' * 台紙の形を 48×48 の升目にしたもの。1 が絵のある場所。',
        ' * 画像そのものを実行時に読まないのは、取り込みの途中で読み込み待ちを',
        ' * 入れないため（それと、テストを画像ファイル無しで書けるようにするため）。',
        ' */',
        '',
        f'export const TEMPLATE_GRID = {check.GRID}',
        '',
        '/** 台紙の形。左上から右下へ、1行ずつ並べた 48×48 の升目。 */',
        'export const TEMPLATE_BITS = {',
    ]
    for species, name, bits, ratio in entries:
        lines.append(f'  // {name}（長辺:短辺 = {ratio} : 1）')
        lines.append(f"  {species}: '{bits}',")
    lines += ['} as const', '']
    out.write_text('\n'.join(lines), encoding='utf-8')
    print(f'\n{len(entries)} 種を {out} に書いた')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
