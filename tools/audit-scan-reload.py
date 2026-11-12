#!/usr/bin/env python3
"""読込中の画面再読込で待ち行列を失っても、未保存の原稿を拾い直せるか検査する。"""
import argparse
import json
from pathlib import Path
import time
from playwright.sync_api import sync_playwright

PROBE = '''() => {window.reloadAudit=[];
window.aquarium.onIncoming(photo=>window.reloadAudit.push(photo.key));
const decode=HTMLImageElement.prototype.decode;
HTMLImageElement.prototype.decode=async function(){await decode.call(this);await new Promise(r=>setTimeout(r,2000));};}'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out',type=Path)
    parser.add_argument('--fixtures',type=Path,required=True)
    parser.add_argument('--cdp',required=True)
    parser.add_argument('--rounds',type=int,default=5)
    parser.add_argument('--phase',choices=['before','after'],default='after')
    args=parser.parse_args();root=args.out.resolve()
    sources=sorted(args.fixtures.glob('*-colored-cropped.png'));assert len(sources)==6
    reports=[]
    with sync_playwright() as p:
        b=p.chromium.connect_over_cdp(args.cdp);page=b.contexts[0].pages[0]
        page.wait_for_function('typeof window.aquarium !== "undefined"')
        settings=page.evaluate('()=>window.aquarium.getSettings()')
        assert settings['watchFolder']==str(root/'inbox') and settings['theme']=='zoo'
        assert page.evaluate('()=>window.aquarium.listPieces()')==[]
        for batch in range(args.rounds):
            page.evaluate(PROBE)
            for source in sources:
                (root/'inbox'/f'{batch:03}-{source.name}').write_bytes(source.read_bytes())
            page.wait_for_function('window.reloadAudit.length===6',timeout=30000)
            page.reload();page.wait_for_function('typeof window.aquarium !== "undefined"')
            if args.phase=='before':
                page.wait_for_timeout(10000)
                pieces=page.evaluate('()=>window.aquarium.listPieces()')
                assert len(pieces)<(batch+1)*6, pieces
                report={'phase':'before','expected':(batch+1)*6,'saved':len(pieces),'missing':(batch+1)*6-len(pieces)}
                (root/'reload-results.json').write_text(json.dumps(report,indent=2))
                print(report,flush=True)
                return
            deadline=time.monotonic()+60
            while True:
                pieces=page.evaluate('()=>window.aquarium.listPieces()')
                if len(pieces)==(batch+1)*6:break
                assert time.monotonic()<deadline,('再読込後に絵が不足',batch,len(pieces))
                page.wait_for_timeout(100)
            assert len(set(x['key'] for x in pieces))==len(pieces)
            assert all(x['theme']=='zoo' and x['species']==x['fileName'].split('-',1)[1].split('-',1)[0] for x in pieces)
            reports.append({'reload':batch+1,'saved':len(pieces),'unique':len(set(x['key'] for x in pieces))})
            print(reports[-1],flush=True)
            (root/'reload-results.json').write_text(json.dumps(reports,indent=2))
        print(f'PASS: {args.rounds} reloads, {len(pieces)} pieces preserved',flush=True)


if __name__=='__main__':main()
