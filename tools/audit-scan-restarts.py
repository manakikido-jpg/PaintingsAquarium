#!/usr/bin/env python3
"""監査用プロファイルだけを再起動し、台帳・画像・設定の保持を確認する。"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out',type=Path)
    parser.add_argument('--cdp',required=True)
    parser.add_argument('--port',type=int,required=True)
    parser.add_argument('--display',required=True)
    parser.add_argument('--expected',type=int,required=True)
    parser.add_argument('--cycles',type=int,default=3)
    args=parser.parse_args();root=args.out.resolve();profile=root/'profile';data=profile/'data'
    assert 'zoo-audit' in root.parts,'監査用フォルダだけで実行してください'
    index=(data/'pieces.json').read_bytes();pieces=json.loads(index)
    assert len(pieces)==args.expected and all(x['fileName'].startswith('batch') for x in pieces)
    def hashes():return {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (data/'pieces').glob('*')}
    original_hashes=hashes();reports=[];process=None
    with sync_playwright() as p:
        b=p.chromium.connect_over_cdp(args.cdp);page=b.contexts[0].pages[0]
        location=page.evaluate('()=>window.aquarium.getStorageLocation()')
        settings=page.evaluate('()=>window.aquarium.getSettings()')
        assert location['dataRoot']==str(data) and settings['watchFolder']==str(root/'inbox')
        try:
            for cycle in range(args.cycles):
                for proc in Path('/proc').iterdir():
                    if not proc.name.isdigit():continue
                    try:
                        parts=(proc/'cmdline').read_bytes().split(b'\0')
                        if parts[0].endswith(b'/electron') and ('--user-data-dir='+str(profile)).encode() in parts:
                            os.kill(int(proc.name),signal.SIGTERM)
                    except OSError:pass
                time.sleep(.5)
                env={**os.environ,'DISPLAY':args.display,'XDG_CONFIG_HOME':'/workspace/.cloud-setup/dev-config',
                     'XDG_CACHE_HOME':'/workspace/.cache'}
                with (root/f'restart-{cycle+1}.log').open('w') as log:
                    process=subprocess.Popen([str(ROOT/'node_modules/electron/dist/electron'),'.','--no-sandbox',
                        '--user-data-dir='+str(profile),'--remote-debugging-port='+str(args.port)],cwd=ROOT,
                        env=env,stdout=log,stderr=log)
                deadline=time.monotonic()+30
                while True:
                    try:
                        b=p.chromium.connect_over_cdp(args.cdp,timeout=3000)
                        page=b.contexts[0].pages[0]
                        page.wait_for_function('typeof window.aquarium!=="undefined"',timeout=10000)
                        break
                    except Exception:
                        assert time.monotonic()<deadline,'再起動後に接続できない'
                        time.sleep(.2)
                page.wait_for_timeout(2000)
                current=page.evaluate('()=>window.aquarium.listPieces()')
                assert current==pieces
                assert page.evaluate('()=>window.aquarium.getSettings()')==settings
                assert (data/'pieces.json').read_bytes()==index
                assert hashes()==original_hashes
                reports.append({'restart':cycle+1,'saved':len(current),'metadataIdentical':True,
                                'imageHashesIdentical':True,'settingsIdentical':True})
                print(reports[-1],flush=True)
                (root/'restart-results.json').write_text(json.dumps(reports,indent=2))
        finally:
            if process:process.terminate()
    print(f'PASS: {args.cycles} restarts',flush=True)


if __name__=='__main__':main()
