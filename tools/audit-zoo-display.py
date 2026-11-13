#!/usr/bin/env python3
"""監査用データだけを使い、旧魚用リグ・未判定・テーマ欠損の実描画を比較する。"""
import argparse
import json
from pathlib import Path
from statistics import median
from playwright.sync_api import sync_playwright

PROBE = '''window.artAudit={};
const original=CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
 if(image.src&&image.src.startsWith('aqua://piece/')){
   const id=decodeURIComponent(new URL(image.src).pathname.slice(1));
   const r=window.artAudit[id]||(window.artAudit[id]={calls:0,aquaticSlices:0,sizes:[],bottoms:[],urls:[]});r.calls++;
   if(!r.urls.includes(image.src))r.urls.push(image.src);
   let width,height;
   if(args.length===4){width=args[2];height=args[3];const m=this.getTransform();
     if(r.bottoms.length<2000)r.bottoms.push(m.f+height/2*Math.abs(m.d));}
   if(args.length===8){const [sx,sy,sw,sh,dx,dy,dw,dh]=args;
     if((sy===0&&sh>=image.naturalHeight*.999&&sw<image.naturalWidth*.5)||
        (sx===0&&sw>=image.naturalWidth*.999&&sh<image.naturalHeight*.5))r.aquaticSlices++;
     if(sw>image.naturalWidth*.7){width=dw/sw*image.naturalWidth;height=dh/sh*image.naturalHeight;}
   }
   if(width&&height&&r.sizes.length<2000)r.sizes.push(Math.max(width,height));
 }
 return original.call(this,image,...args);
};'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', type=Path)
    parser.add_argument('--cdp',required=True)
    parser.add_argument('--phase',choices=['before','after'],required=True)
    args=parser.parse_args()
    args.out.mkdir(parents=True,exist_ok=True)
    report={}
    with sync_playwright() as p:
        b=p.chromium.connect_over_cdp(args.cdp)
        page=b.contexts[0].pages[0]
        page.wait_for_function('typeof window.aquarium !== "undefined"')
        pieces=page.evaluate('()=>window.aquarium.listPieces()')
        if not pieces or any(not piece['key'].startswith('zoo-audit:') for piece in pieces):
            raise SystemExit('監査用データのあるプロファイルだけで実行してください')
        page.add_init_script(PROBE)
        page.reload();page.wait_for_function('typeof window.aquarium !== "undefined"')
        page.wait_for_timeout(2200)
        if page.evaluate('()=>window.aquarium.getSettings()')['theme']!='zoo':
            page.keyboard.press('s');page.get_by_role('button',name='動物園',exact=True).click()
            page.get_by_role('button',name='閉じる',exact=True).click();page.wait_for_timeout(1200)
        client=b.contexts[0].new_cdp_session(page)
        sizes=[(1280,800)] if args.phase=='before' else [(1280,800),(800,600),(1920,1080),(3840,2160),(2560,720)]
        for w,h in sizes:
            client.send('Emulation.setDeviceMetricsOverride',{'width':w,'height':h,'deviceScaleFactor':1,'mobile':False})
            page.wait_for_timeout(400)
            page.evaluate('window.artAudit={}')
            page.wait_for_timeout(1600)
            raw=page.evaluate('window.artAudit')
            canvas=page.locator('canvas').evaluate('(c)=>({width:c.clientWidth,height:c.clientHeight})')
            summarized={id:{'aquaticSlices':r['aquaticSlices'], 'longSide':median(r['sizes']) if r['sizes'] else None,
                            'bottom':median(r['bottoms']) if r['bottoms'] else None,'urls':r['urls']} for id,r in raw.items()}
            if args.phase=='before':
                assert any(r['aquaticSlices']>0 for id,r in raw.items() if id.startswith('unknown-')),summarized
                assert not any(id.startswith('no-theme-') for id in raw),summarized
            else:
                expected=[piece['id'] for piece in pieces]
                assert set(expected)<=set(raw), ('drawings disappeared',summarized)
                assert all(r['aquaticSlices']==0 for r in raw.values()),summarized
                base=min(canvas['width']*.17,min(canvas['width'],canvas['height'])*.4)
                for id,r in summarized.items():
                    if not(id.startswith('unknown-') or id.startswith('foreign-')):continue
                    assert base*.74<=r['longSide']<=base*1.02,(id,canvas,base,r)
                    assert r['bottom']>canvas['height']*.53,(id,r)
            report[f'zoo-{w}x{h}']={'canvas':canvas,'pieces':summarized}
        client.send('Emulation.clearDeviceMetricsOverride')
        page.wait_for_timeout(500)
        page.locator('canvas').screenshot(path=str(args.out/f'{args.phase}-zoo.png'))
        page.keyboard.press('s');page.get_by_role('button',name='水族館',exact=True).click()
        page.get_by_role('button',name='閉じる',exact=True).click();page.wait_for_timeout(300)
        page.evaluate('window.artAudit={}')
        page.wait_for_timeout(1500)
        raw=page.evaluate('window.artAudit')
        missing={id:median(r['sizes']) for id,r in raw.items() if id.startswith('no-theme-') and r['sizes']}
        if args.phase=='before':
            assert len(missing)==2,missing
            assert all(size<page.locator('canvas').evaluate('(c)=>c.clientWidth')*.09 for size in missing.values()),missing
        else: assert not missing,missing
        report['aquarium-missing-theme-sizes']=missing
        page.locator('canvas').screenshot(path=str(args.out/f'{args.phase}-aquarium.png'))
        (args.out/f'{args.phase}-display.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        page.keyboard.press('s');page.get_by_role('button',name='動物園',exact=True).click()
        page.get_by_role('button',name='閉じる',exact=True).click()
        print(f'PASS {args.phase}: wave fallback, missing theme, display sizes checked at {sizes}',flush=True)


if __name__=='__main__': main()
