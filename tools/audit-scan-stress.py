#!/usr/bin/env python3
"""処理待ち中の監視再開を繰り返し、保存と受付の重複・欠落を検査する。"""
import argparse
import json
from pathlib import Path
import time
from playwright.sync_api import sync_playwright

PROBE = '''() => {window.scanAudit={arrivals:[],busy:0,delayMs:250};
window.aquarium.onIncoming(photo=>window.scanAudit.arrivals.push(photo.key));
const oldDecode=HTMLImageElement.prototype.decode;
HTMLImageElement.prototype.decode=async function(){window.scanAudit.busy++;
try{await oldDecode.call(this);if(window.scanAudit.delayMs)await new Promise(r=>setTimeout(r,window.scanAudit.delayMs));}
finally{window.scanAudit.busy--}};}'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', type=Path)
    parser.add_argument('--fixtures', type=Path, required=True)
    parser.add_argument('--cdp', required=True)
    parser.add_argument('--rounds', type=int, default=10)
    parser.add_argument('--phase', choices=['before','after'], required=True)
    parser.add_argument('--delay-ms',type=int,default=250)
    parser.add_argument('--start-batch',type=int,default=0)
    parser.add_argument('--wait-seconds',type=int,default=120)
    args = parser.parse_args()
    root = args.out.resolve()
    sources = sorted(args.fixtures.glob('*-colored-cropped.png'))
    assert len(sources) == 6
    reports = []
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp(args.cdp)
        page = b.contexts[0].pages[0]
        page.wait_for_function('typeof window.aquarium !== "undefined"')
        settings = page.evaluate('()=>window.aquarium.getSettings()')
        assert settings['watchFolder'] == str(root/'inbox') and settings['theme']=='zoo'
        initial=page.evaluate('()=>window.aquarium.listPieces()')
        assert len(initial)==args.start_batch*12
        assert all(piece['fileName'].startswith('batch') for piece in initial)
        page.reload()
        page.wait_for_function('typeof window.aquarium !== "undefined"')
        page.bring_to_front()
        page.evaluate(PROBE.replace('delayMs:250',f'delayMs:{args.delay_ms}'))
        for batch in range(args.start_batch,args.rounds):
            for i, source in enumerate(sources):
                for copy in range(2):
                    (root/'inbox'/f'batch{batch:03}-{copy}-{source.name}').write_bytes(source.read_bytes())
            deadline=time.monotonic()+30
            while len(page.evaluate('window.scanAudit.arrivals')) < (batch-args.start_batch+1)*12:
                assert time.monotonic()<deadline,'受付が止まった'
                page.wait_for_timeout(100)
            for repeat in range(3):
                page.evaluate('()=>window.aquarium.rescan()')
                page.wait_for_timeout(650)
            deadline=time.monotonic()+args.wait_seconds
            last_count=-1;quiet_since=time.monotonic()
            while True:
                pieces=page.evaluate('()=>window.aquarium.listPieces()')
                if len(pieces)!=last_count:
                    last_count=len(pieces);quiet_since=time.monotonic()
                busy=page.evaluate('window.scanAudit.busy')
                if len(pieces)>=(batch+1)*12 and busy==0 and time.monotonic()-quiet_since>3:break
                assert time.monotonic()<deadline,('処理が終わらない',len(pieces))
                page.wait_for_timeout(200)
            keys=[piece['key'] for piece in pieces]
            arrivals=page.evaluate('window.scanAudit.arrivals')
            row={'batch':batch+1,'expectedSaved':(batch+1)*12,'saved':len(pieces),
                 'duplicateSaved':len(keys)-len(set(keys)),
                 'duplicateArrivals':len(arrivals)-len(set(arrivals))}
            reports.append(row);print(row,flush=True)
            (root/'stress-results.json').write_text(json.dumps(reports,indent=2))
            if args.phase=='after':
                assert len(pieces)==(batch+1)*12 and row['duplicateSaved']==0,row
                assert row['duplicateArrivals']==0,row
                assert all(piece['theme']=='zoo' and piece['species']==piece['fileName'].split('-',2)[2].split('-',1)[0] for piece in pieces)
            else:assert row['duplicateSaved']>0,row
    print(f'PASS {args.phase}: batches {args.start_batch+1} through {args.rounds}',flush=True)


if __name__=='__main__':main()
