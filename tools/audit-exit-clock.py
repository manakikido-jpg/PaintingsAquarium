#!/usr/bin/env python3
"""表示上限変更後、低FPSでも退出の締切が実時間で働くかCanvasで検査する。"""
import argparse
import json
from pathlib import Path
import re
from playwright.sync_api import sync_playwright

PROBE='''()=>{window.exitAudit={offsetMs:0,counts:[],ids:new Set()};
const draw=CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
 if(typeof image.src==='string'&&image.src.startsWith('aqua://piece/'))window.exitAudit.ids.add(image.src);
 return draw.call(this,image,...args);};
const frame=window.requestAnimationFrame;
window.requestAnimationFrame=callback=>frame(t=>{window.exitAudit.ids=new Set();callback(t+window.exitAudit.offsetMs);
 window.exitAudit.counts.push(window.exitAudit.ids.size);});}'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out',type=Path)
    parser.add_argument('--cdp',required=True)
    parser.add_argument('--phase',choices=['before','after'],required=True)
    args=parser.parse_args();root=args.out.resolve()
    with sync_playwright() as p:
        b=p.chromium.connect_over_cdp(args.cdp);page=b.contexts[0].pages[0]
        page.wait_for_function('typeof window.aquarium!=="undefined"')
        settings=page.evaluate('()=>window.aquarium.getSettings()')
        assert settings['watchFolder']==str(root/'inbox')
        assert all(x['fileName'].startswith('batch') for x in page.evaluate('()=>window.aquarium.listPieces()'))
        try:
            page.evaluate(PROBE)
            page.keyboard.press('s')
            slider=page.get_by_role('slider',name=re.compile('同時に泳ぐ数'))
            slider.press('Home')
            assert page.evaluate('()=>window.aquarium.getSettings()')['maxVisible']==10
            page.evaluate('window.exitAudit.counts=[]')
            page.wait_for_function('window.exitAudit.counts.length>=2',timeout=30000)
            page.evaluate('window.exitAudit.offsetMs=21000')
            page.wait_for_function('window.exitAudit.counts.length>=4',timeout=30000)
            counts=page.evaluate('window.exitAudit.counts')
            if args.phase=='before':assert counts[-1]>10,counts
            else:assert counts[-1]==10,counts
            report={'phase':args.phase,'limit':10,'simulatedWallJumpSeconds':21,'drawnCounts':counts}
            (root/f'exit-{args.phase}.json').write_text(json.dumps(report,indent=2));print(report,flush=True)
        finally:
            page.evaluate('patch=>window.aquarium.updateSettings(patch)',{'maxVisible':settings['maxVisible']})
            page.reload()


if __name__=='__main__':main()
