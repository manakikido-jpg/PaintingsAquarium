#!/usr/bin/env python3
"""隔離Electronで旧画像の自動紙除去・監視取り込み・再読込を通す。"""
import argparse
import base64
import importlib.util
import json
import hashlib
from pathlib import Path
import time
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', type=Path)
    parser.add_argument('--fixtures', type=Path, required=True)
    parser.add_argument('--cdp', required=True)
    args = parser.parse_args()
    root = args.out.resolve()
    sources = sorted(args.fixtures.glob('*.png'))
    assert len(sources) == 6
    spec = importlib.util.spec_from_file_location('release_smoke', Path(__file__).with_name('smoke-zoo-release.py'))
    smoke = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(smoke)
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(args.cdp)
        page = browser.contexts[0].pages[0]
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.wait_for_selector('canvas')
        location = page.evaluate('()=>window.aquarium.getStorageLocation()')
        assert location['dataRoot'] == str(root/'profile/data')
        before = page.evaluate('()=>window.aquarium.listPieces()')
        assert len(before) == 6 and all(x['key'].startswith('paper-fix-synthetic:') for x in before)
        settings = page.evaluate('()=>window.aquarium.getSettings()')
        assert settings['theme'] == 'zoo' and settings['cutout']['auto'] is True
        page.wait_for_timeout(1800)
        page.screenshot(path=str(root/'before.png'))
        original_sha = {x['id']: hashlib.sha256((root/'profile/data/pieces'/(x['id']+'.webp')).read_bytes()).hexdigest() for x in before}
        # 退避先を作れない状況でも、元画像を上書きせず、次の絵へ進んで通知する。
        blocked = root/'profile/data/paper-repair-backup'
        assert not blocked.exists()
        blocked.write_text('synthetic blocked backup destination')
        for piece in before:
            page.evaluate('id=>window.aquarium.updatePiece(id,{built:3})', piece['id'])
        page.reload()
        page.wait_for_selector('canvas')
        page.get_by_text('保存画像の作り直しに失敗しました。', exact=False).first.wait_for(timeout=30000)
        page.wait_for_timeout(7000)
        failed = page.evaluate('()=>window.aquarium.listPieces()')
        assert all(x['built'] == 3 and x['imageRevision'] == 0 for x in failed)
        for x in failed:
            assert hashlib.sha256((root/'profile/data/pieces'/(x['id']+'.webp')).read_bytes()).hexdigest() == original_sha[x['id']]
        blocked.unlink()  # この検査で作った一時障害ファイルだけを解除する。
        page.reload()
        page.wait_for_selector('canvas')
        page.evaluate(smoke.PROBE)

        def wait(check, message):
            deadline = time.monotonic()+100
            while not check():
                assert time.monotonic() < deadline, message
                page.wait_for_timeout(200)

        wait(lambda: all(x['built'] == 4 and x['imageRevision'] == 1
                         for x in page.evaluate('()=>window.aquarium.listPieces()')), '旧画像の修復が完了しない')
        after = page.evaluate('()=>window.aquarium.listPieces()')
        for old, new in zip(before, after):
            assert all(old[k] == new[k] for k in ['id', 'key', 'fileName', 'createdAt', 'theme', 'species'])
            data = page.evaluate('id=>window.aquarium.readPieceImage(id)', new['id'])
            (root/(new['species']+'-repaired.webp')).write_bytes(base64.b64decode(data))
            backup = root/'profile/data/paper-repair-backup'/(new['id']+'.webp')
            assert hashlib.sha256(backup.read_bytes()).hexdigest() == original_sha[new['id']]
        wait(lambda: len(page.evaluate('window.releaseSmoke.positions')) == 6, '6種の描画が揃わない')
        page.wait_for_timeout(2000)
        assert all(len(v)>1 for v in page.evaluate('window.releaseSmoke.positions').values())
        page.screenshot(path=str(root/'after.png'))
        page.keyboard.press('s')
        assert page.get_by_role('checkbox', name='明るさを写真ごとに自動で合わせる').is_checked()
        page.get_by_role('button', name='閉じる', exact=True).click()
        assert page.evaluate('()=>window.aquarium.getSettings()') == settings
        for file in sources:
            (root/'inbox'/file.name).write_bytes(file.read_bytes())
        wait(lambda: len(page.evaluate('()=>window.aquarium.listPieces()')) == 12, '新しい6枚の取り込みが完了しない')
        imported = page.evaluate('()=>window.aquarium.listPieces()')[6:]
        assert all(x['species'] == x['fileName'].split('_', 1)[1].removesuffix('.png') and x['built'] == 4 for x in imported)
        page.evaluate('()=>window.aquarium.rescan()')
        page.wait_for_timeout(1500)
        page.reload()
        page.wait_for_selector('canvas')
        page.wait_for_timeout(2000)
        final = page.evaluate('()=>window.aquarium.listPieces()')
        assert len(final) == 12
        assert all(x['imageRevision'] == 1 for x in final[:6])
        assert not errors, errors
        result = {'synthetic': True, 'oldImagesRepaired': 6, 'identityAndSettingsPreserved': True,
                  'backupFailurePreservesImagesAndNotifies': True, 'originalBackupsMatch': True,
                  'allSixMoving': True, 'newScansSaved': 6, 'afterRescanAndReload': 12,
                  'unnecessaryRepeatRepair': False, 'rendererErrors': errors}
        (root/'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
