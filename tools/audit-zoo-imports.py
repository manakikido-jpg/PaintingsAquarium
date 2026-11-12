#!/usr/bin/env python3
"""隔離したElectronで、変形スキャン→保存→画像再読込→作り直しを検査する。

python tools/audit-zoo-imports.py /tmp/zoo-audit --cdp http://127.0.0.1:9233
テスト用プロファイルの取り込み先を <出力先>/inbox に設定してから実行する。
既存の実データがあるプロファイルでは保存処理を実行しない。
"""
import argparse
import base64
import importlib.util
import json
import math
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tools' / file)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def fixtures(out):
    sheets = module('sheets', 'make-sheets.py')
    colors = module('colors', 'color-halloween-sheets.py')
    target = out / 'fixtures'
    target.mkdir(parents=True, exist_ok=True)
    cases = []
    for index, source in enumerate(sorted((ROOT / 'assets/templates/zoo').glob('*.png'))):
        animal = source.stem.split('_', 1)[1]
        colored = colors.color_sheet(source, 20261112 + index).convert('RGB')
        color_file = target / f'{animal}-source.png'
        colored.save(color_file)
        page = sheets.sheet(color_file, 'お絵描き動物園', 'すきな いろで ぬってね',
                            title_left=True, title_cap_mm=9, lead_cap_mm=4).convert('RGB')
        blank = sheets.sheet(source, 'お絵描き動物園', 'すきな いろで ぬってね',
                             title_left=True, title_cap_mm=9, lead_cap_mm=4).convert('RGB')
        small = page.copy()
        small.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        gray = small.convert('L').convert('RGB')
        faint = Image.blend(small, Image.new('RGB', small.size, 'white'), 0.4)
        marks = small.copy()
        pen = ImageDraw.Draw(marks)
        w, h = marks.size
        pen.line([(w*.07, h*.55), (w*.15, h*.68), (w*.09, h*.80)], fill='#377da8', width=3)
        connected = small.copy()
        ImageDraw.Draw(connected).line([(w*.50,h*.66),(w*.29,h*.54),(w*.70,h*.40),
                                       (w*.36,h*.72),(w*.74,h*.60)], fill='#3b9dbe', width=4)
        variants = {
            'blank-a4': blank, 'colored-a4': page, 'colored-cropped': colored,
            'rotate90': small.transpose(Image.Transpose.ROTATE_90),
            'rotate180': small.transpose(Image.Transpose.ROTATE_180),
            'rotate270': small.transpose(Image.Transpose.ROTATE_270),
            'tilt-plus6-jpeg': small.rotate(6, resample=Image.Resampling.BICUBIC, fillcolor='white'),
            'tilt-minus6-jpeg': small.rotate(-6, resample=Image.Resampling.BICUBIC, fillcolor='white'),
            'faint': faint, 'grayscale-jpeg': gray,
            'margin-marks': marks, 'connected-marks': connected,
        }
        for name, image in variants.items():
            file = target / f'{animal}-{name}.{ "jpg" if "jpeg" in name else "png" }'
            image.save(file, **({'quality': 60} if file.suffix == '.jpg' else {}))
            cases.append({'animal': animal, 'variant': name, 'path': str(file),
                          'strict': name != 'connected-marks'})
    for name, content in [('empty', Image.new('RGB', (1200, 800), 'white')),
                          ('gray-paper', Image.new('RGB', (1200, 800), '#b4b4b4'))]:
        file = target / f'{name}.png'
        content.save(file)
        cases.append({'animal': None, 'variant': name, 'path': str(file), 'reject': True})
    file = target / 'broken.jpg'
    file.write_bytes(b'not an image')
    cases.append({'animal': None, 'variant': 'broken', 'path': str(file), 'reject': True})
    (out / 'manifest.json').write_text(json.dumps(cases, ensure_ascii=False, indent=2))
    return cases


JS = '''async ({dataUrl, name, key}) => {
  const result = await AuditPipeline.processPhoto(dataUrl, name, AuditPipeline.DEFAULT_CUTOUT_OPTIONS, 'zoo');
  if (!result.ok) return {status:'rejected', message:result.message};
  const piece = await window.aquarium.savePiece({key, fileName:name, theme:'zoo',
    imageBase64:result.imageBase64, width:result.width, height:result.height,
    rig:result.rig, species:result.species, head:result.head, fit:result.fit, built:AuditPipeline.RIG_VERSION});
  const encoded = await window.aquarium.readPieceImage(piece.id);
  const rebuilt = await AuditPipeline.rebuildPiece('data:image/webp;base64,'+encoded, 'zoo');
  if (!rebuilt) throw new Error('saved image did not decode');
  await window.aquarium.updatePiece(piece.id, {...rebuilt, built:AuditPipeline.RIG_VERSION});
  return {status:'saved', id:piece.id, theme:piece.theme, width:piece.width, height:piece.height,
    species:piece.species??null, rebuiltSpecies:rebuilt.species??null,
    rebuiltWidth:rebuilt.width, rebuiltHeight:rebuilt.height};
}'''



def geometry_failures(case, result):
    if not case.get('strict') or result.get('status') != 'saved':
        return []
    source = next((ROOT / 'assets/templates/zoo').glob('*_' + case['animal'] + '.png'))
    gray = Image.open(source).convert('L')
    bounds = ImageChops.invert(gray).point(lambda value: 255 if value > 100 else 0).getbbox()
    expected = (bounds[2] - bounds[0]) / (bounds[3] - bounds[1])
    actual = result['width'] / result['height']
    tolerance = .25 if case['variant'].startswith('tilt-') else .10
    return ['cropped aspect differs from template'] if abs(math.log(actual / expected)) > tolerance else []


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', type=Path)
    parser.add_argument('--cdp', default='http://127.0.0.1:9233')
    parser.add_argument('--check-results', action='store_true', help='保存済み結果の縦横比だけ再検査する')
    args = parser.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    if args.check_results:
        rows = json.loads((out / 'results.json').read_text())
        failures = [(row['path'], geometry_failures(row, row)) for row in rows if geometry_failures(row, row)]
        print(f'{sum(bool(r.get("strict")) for r in rows)} strict geometry cases; {len(failures)} failed')
        if failures: print(failures)
        raise SystemExit(1 if failures else 0)
    cases = fixtures(out)
    entry = out / 'entry.ts'
    entry.write_text(''.join(f'export {{ {exports} }} from {json.dumps(str(ROOT / file))};\n'
        for exports, file in [
            ('processPhoto, rebuildPiece', 'src/renderer/processImage.ts'),
            ('DEFAULT_CUTOUT_OPTIONS', 'src/core/cutout.ts'),
            ('RIG_VERSION', 'src/shared/types.ts'),
        ]))
    bundle = out / 'pipeline.js'
    subprocess.run([str(ROOT/'node_modules/.bin/esbuild'), str(entry), '--bundle', '--format=iife',
                    '--global-name=AuditPipeline', f'--outfile={bundle}'], check=True)
    results = []
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(args.cdp)
        page = browser.contexts[0].pages[0]
        page.set_default_timeout(120000)
        page.wait_for_function('typeof window.aquarium !== "undefined"')
        settings = page.evaluate('()=>window.aquarium.getSettings()')
        if settings['watchFolder'] != str(out/'inbox'):
            raise SystemExit('隔離したテスト用プロファイルだけで実行してください')
        existing = page.evaluate('()=>window.aquarium.listPieces()')
        if any(not piece['key'].startswith('zoo-audit:') for piece in existing):
            raise SystemExit('実データがあるため中断しました')
        page.add_script_tag(path=str(bundle))
        for case in cases:
            file = Path(case['path'])
            url = f'data:image/{"jpeg" if file.suffix==".jpg" else "png"};base64,' + base64.b64encode(file.read_bytes()).decode()
            result = page.evaluate(JS, {'dataUrl':url, 'name':file.name, 'key':'zoo-audit:'+file.stem})
            failures = []
            if case.get('reject'):
                if result['status'] != 'rejected': failures.append('invalid input accepted')
            elif result['status'] != 'saved': failures.append('valid drawing rejected')
            else:
                for field in ['species', 'rebuiltSpecies']:
                    if result[field] != case['animal'] and (case['strict'] or result[field] is not None):
                        failures.append(f'{field}: {result[field]} != {case["animal"]}')
                if result['width'] <= 0 or result['height'] <= 0: failures.append('empty size')
                if result['theme'] != 'zoo': failures.append('wrong saved theme')
                if abs(result['rebuiltWidth']/result['rebuiltHeight']-result['width']/result['height']) > .1:
                    failures.append('aspect changed on rebuild')
            failures.extend(geometry_failures(case, result))
            row = {**case, **result, 'failures':failures}
            results.append(row)
            (out/'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
            print(f'{len(results)}/{len(cases)} {file.stem}: {result.get("species",result["status"])} '
                  f'-> {result.get("rebuiltSpecies", "-")} {failures}', flush=True)
    failed = [r for r in results if r['failures']]
    print(f'{len(results)} cases; {len(failed)} failed', flush=True)
    raise SystemExit(1 if failed else 0)


if __name__ == '__main__':
    main()
