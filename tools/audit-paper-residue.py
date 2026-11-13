#!/usr/bin/env python3
"""動物園の色むら台紙と、旧処理で紙が残った保存画像の修復を実ブラウザーで検査する。"""
import argparse
import base64
import importlib.util
import io
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def data_url(image):
    out = io.BytesIO()
    image.save(out, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(out.getvalue()).decode()


def cast(image):
    a = np.array(image.convert('RGB')).astype(float)
    h, w = a.shape[:2]
    y, x = np.mgrid[:h, :w]
    t = np.exp(-(((x-w*.52)/(w*.27))**2 + ((y-h*.60)/(h*.33))**2)*2)[:, :, None]
    tint = np.array([250, 249, 226])*(1-t) + np.array([232, 217, 246])*t
    return Image.fromarray(np.clip(a*tint/255, 0, 255).astype('uint8'))


def decode(result):
    return Image.open(io.BytesIO(base64.b64decode(result['imageBase64']))).convert('RGBA')


def difference(actual, reference):
    # 線のアンチエイリアスの差は3pxまで許容。紙の塊は面積として数える。
    assert abs(actual.width-reference.width) <= 4 and abs(actual.height-reference.height) <= 4
    alpha = actual.getchannel('A')
    ref = reference.getchannel('A').resize(actual.size)
    mask = np.array(alpha) > 24
    outer = np.array(ref.filter(ImageFilter.MaxFilter(7))) > 24
    # 旧処理は脚の狭い隙間まで白く塞いでいることがある。それを胴の白と
    # 同一視しない。黒い閉曲線の内側と塗り色を保護対象として数える。
    rgba = np.array(reference.resize(actual.size))
    rgb = rgba[:, :, :3].astype(float)
    high, low = rgb.max(axis=2), rgb.min(axis=2)
    visible = rgba[:, :, 3] > 200
    outline = (high < 255*.45) & visible
    body = ndimage.binary_fill_holes(outline)
    colour = ((high-low)/np.maximum(high, 1) > .2) & visible
    inner = ndimage.binary_erosion(body | colour, iterations=3)
    extra = int((mask & ~outer).sum())
    missing = int((inner & ~mask).sum())
    assert extra <= 20 and missing <= 20, (extra, missing)
    return {'outsidePaperPixels': extra, 'missingInteriorPixels': missing}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', type=Path)
    args = parser.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    sheets = load('sheets', ROOT/'tools/make-sheets.py')
    colors = load('colors', ROOT/'tools/color-halloween-sheets.py')
    entry = out/'entry.ts'
    entry.write_text('export {processPhoto,rebuildPiece} from '+json.dumps(str(ROOT/'src/renderer/processImage.ts')))
    bundle = out/'pipeline.js'
    subprocess.run([str(ROOT/'node_modules/.bin/esbuild'), str(entry), '--bundle', '--format=iife',
                    '--global-name=Pipeline', f'--outfile={bundle}'], check=True)
    results = []
    seeds = []
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page = browser.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content('<html></html>')
        page.add_script_tag(path=str(bundle))
        for index, src in enumerate(sorted((ROOT/'assets/templates/zoo').glob('*.png'))):
            animal = src.stem.split('_', 1)[1]
            painted = out/(src.stem+'-painted.png')
            colors.color_sheet(src, index+20261113).save(painted)
            for variant, art in [('blank', src), ('painted', painted)]:
                sheet = sheets.sheet(art, 'お絵描き動物園', 'すきな いろで ぬってね',
                    title_left=True, title_cap_mm=7, lead_cap_mm=3,
                    art_scale={'kirin': .99, 'shimauma': .78}.get(animal, .75)).convert('RGB')
                sheet.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
                tinted = cast(sheet)
                prefix = f'{animal}-{variant}'
                tinted.save(out/(prefix+'-scan.png'))
                process = '''async ({url,auto})=>Pipeline.processPhoto(url,'scan.png',
                  {auto,paperValue:.6,paperSaturation:.29,feather:.1},'zoo')'''
                clean = page.evaluate(process, {'url': data_url(sheet), 'auto': True})
                fixed = page.evaluate(process, {'url': data_url(tinted), 'auto': True})
                old = page.evaluate(process, {'url': data_url(tinted), 'auto': False})
                assert clean['ok'] and fixed['ok'] and old['ok'], prefix
                assert clean['species'] == fixed['species'] == animal
                decode(old).save(out/(prefix+'-before.webp'))
                decode(fixed).save(out/(prefix+'-after.webp'))
                decode(clean).save(out/(prefix+'-control.webp'))
                row = {'animal': animal, 'variant': variant,
                       'fresh': difference(decode(fixed), decode(clean))}
                rebuilt = page.evaluate('url=>Pipeline.rebuildPiece(url,"zoo")',
                    'data:image/webp;base64,'+old['imageBase64'])
                assert rebuilt and rebuilt.get('species') == animal, prefix
                decode(rebuilt).save(out/(prefix+'-repaired.webp'))
                row['repaired'] = difference(decode(rebuilt), decode(clean))
                results.append(row)
                if variant == 'blank':
                    seeds.append({'animal': animal, 'image': str(out/(prefix+'-before.webp')),
                        'metadata': {k: v for k, v in old.items() if k in
                         ['width', 'height', 'species', 'rig', 'head', 'fit']}})
        # 台紙に当たらない淡色の自由画を、紙色として学習して消さない。
        freehand = Image.new('RGB', (640, 480), 'white')
        ImageDraw.Draw(freehand).rectangle((100, 120, 540, 360), fill=(202, 222, 255))
        free = page.evaluate(process, {'url': data_url(freehand), 'auto': True})
        assert free['ok'] and free.get('species') is None, free.get('message', free.get('species'))
        assert free['width'] >= 440 and free['height'] >= 240
        browser.close()
    assert not errors, errors
    (out/'seeds.json').write_text(json.dumps(seeds, ensure_ascii=False, indent=2))
    summary = {'synthetic': True, 'cases': results, 'paleFreehandPreserved': True, 'browserErrors': errors}
    (out/'results.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
