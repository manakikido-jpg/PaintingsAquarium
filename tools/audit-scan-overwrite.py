#!/usr/bin/env python3
"""実Electronの監視で同名・同サイズ上書きと保存済みの重複抑制を確認する。"""
import argparse
import json
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', type=Path)
    parser.add_argument('--fixtures', type=Path, required=True)
    parser.add_argument('--cdp', required=True)
    args = parser.parse_args()
    root = args.out.resolve()
    animals = ['zou', 'raion', 'kirin']
    images = [(args.fixtures / (animal + '-colored-cropped.png')).read_bytes() for animal in animals]
    length = max(map(len, images))
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp(args.cdp)
        page = b.contexts[0].pages[0]
        page.wait_for_function('typeof window.aquarium !== "undefined"')
        settings = page.evaluate('()=>window.aquarium.getSettings()')
        assert settings['watchFolder'] == str(root / 'inbox') and settings['theme'] == 'zoo'
        assert page.evaluate('()=>window.aquarium.listPieces()') == []
        def wait_count(count):
            deadline = time.monotonic() + 30
            while True:
                pieces = page.evaluate('()=>window.aquarium.listPieces()')
                if len(pieces) == count:
                    return
                assert time.monotonic() < deadline, (count, pieces)
                page.wait_for_timeout(100)

        target = root / 'inbox/scan.png'
        for i, content in enumerate(images):
            # PNGの末尾を埋め、種類を変えてもファイル名とバイト数を一定にする。
            target.write_bytes(content + bytes(length - len(content)))
            stamp = 1800000000 + i * 10
            os.utime(target, (stamp, stamp))
            wait_count(i + 1)
        pieces = page.evaluate('()=>window.aquarium.listPieces()')
        assert [piece.get('species') for piece in pieces] == animals, pieces
        # 内容・更新日時が変わらない通知は、新しい紙として扱わない。
        stamp = target.stat().st_mtime_ns
        os.utime(target, ns=(stamp+1000000000, stamp))
        page.wait_for_timeout(1500)
        assert len(page.evaluate('()=>window.aquarium.listPieces()')) == 3
        await_rescan = '()=>window.aquarium.rescan()'
        page.evaluate(await_rescan)
        page.wait_for_timeout(1500)
        assert len(page.evaluate('()=>window.aquarium.listPieces()')) == 3
        # 読めない保存のあと、同じ名前を正常な内容で上書きして復帰する。
        target.write_bytes(b'broken image')
        page.wait_for_timeout(1500)
        target.write_bytes(images[0])
        os.utime(target, (1800000100, 1800000100))
        wait_count(4)
        pieces = page.evaluate('()=>window.aquarium.listPieces()')
        assert pieces[-1].get('species') == 'zou'
        report = {'sameNameAndSizeSpecies': animals, 'duplicateCount': 0, 'recoveredAfterBrokenOverwrite': True,
                  'savedCount': len(pieces)}
        (root / 'overwrite-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(report)


if __name__ == '__main__':
    main()
