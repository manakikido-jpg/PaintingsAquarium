#!/usr/bin/env python3
"""旧PNGの自動作り直しを遅延させ、描画画像と寸法が途中でも一致するか検査する。"""
import argparse
import copy
import json
from pathlib import Path
import time
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

SLOW = '''const NativeImage=window.Image;
window.Image=function(...args){const image=new NativeImage(...args);let loaded=null;
Object.defineProperty(image,'onload',{configurable:true,get(){return loaded},set(fn){loaded=fn}});
image.addEventListener('load',event=>setTimeout(()=>{if(loaded)loaded.call(image,event)},2000));return image};
window.Image.prototype=NativeImage.prototype;'''

PROBE = '''window.rebuildAudit={};const oldDraw=CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage=function(img,...args){
 if(img.src&&img.src.startsWith('aqua://piece/')){
  const id=decodeURIComponent(new URL(img.src).pathname.slice(1));
  const r=window.rebuildAudit[id]||(window.rebuildAudit[id]={maxAspectError:0,mismatches:0,urls:[]});
  if(!r.urls.includes(img.src))r.urls.push(img.src);
  let w,h;
  if(args.length===4){w=args[2];h=args[3]}
  if(args.length===8&&args[2]>img.naturalWidth*.7&&args[3]>img.naturalHeight*.6){
    w=args[6]/args[2]*img.naturalWidth;h=args[7]/args[3]*img.naturalHeight;}
  if(w&&h){const error=Math.abs(Math.log((w/h)/(img.naturalWidth/img.naturalHeight)));
    r.maxAspectError=Math.max(r.maxAspectError,error);if(error>.1)r.mismatches++;}
 }
 return oldDraw.call(this,img,...args);
};'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out',type=Path)
    parser.add_argument('--seed-data',type=Path,required=True)
    parser.add_argument('--cdp',required=True)
    parser.add_argument('--phase',choices=['mid','final'],required=True)
    args=parser.parse_args()
    root=args.out.resolve();data=root/'profile/data'
    with sync_playwright() as p:
        b=p.chromium.connect_over_cdp(args.cdp);page=b.contexts[0].pages[0]
        page.wait_for_function('typeof window.aquarium !== "undefined"')
        location=page.evaluate('()=>window.aquarium.getStorageLocation()')
        assert location['dataRoot']==str(data),'監査用プロファイルだけで実行してください'
        url=page.url;page.goto('about:blank');page.wait_for_timeout(500)
        pieces=copy.deepcopy(json.loads((args.seed_data/'pieces.json').read_text()))
        for piece in pieces:
            assert piece['key'].startswith('zoo-audit:')
            source=next((args.seed_data/'pieces').glob(piece['id']+'.*'))
            art=Image.open(source).transpose(Image.Transpose.ROTATE_90)
            (data/'pieces').mkdir(parents=True,exist_ok=True)
            stale=data/'pieces'/(piece['id']+'.webp')
            if stale.exists():stale.unlink()
            art.save(data/'pieces'/(piece['id']+'.png'))
            piece.update(width=art.width,height=art.height,built=0,imageRevision=0)
        (data/'pieces.json').write_text(json.dumps(pieces))
        page.add_init_script(SLOW+'\n'+PROBE)
        page.goto(url);page.wait_for_function('typeof window.aquarium !== "undefined"')
        deadline=time.monotonic()+120
        while True:
            saved=page.evaluate('()=>window.aquarium.listPieces()')
            if len(saved)==6 and all(x.get('built',0)>=3 for x in saved):break
            assert time.monotonic()<deadline,'自動作り直しが完了しない'
            page.wait_for_timeout(400)
        page.wait_for_timeout(3000)
        stats=page.evaluate('window.rebuildAudit')
        mismatches=sum(s['mismatches'] for s in stats.values())
        if args.phase=='mid':assert mismatches>0,stats
        else:
            assert len(stats)==6,stats
            assert mismatches==0,stats
            assert all(any('revision=1' in url for url in s['urls']) for s in stats.values()),stats
        pixels={}
        for piece in saved:
            assert piece['species']==piece['id'].split('-',1)[1]
            expected=np.array(Image.open(next((args.seed_data/'pieces').glob(piece['id']+'.*'))).convert('RGBA'))
            actual=np.array(Image.open(data/'pieces'/(piece['id']+'.webp')).convert('RGBA'))
            assert actual.shape==expected.shape,(piece['id'],actual.shape,expected.shape)
            alpha_equal=bool(np.array_equal(actual[:,:,3],expected[:,:,3]))
            opaque=expected[:,:,3]>200
            error=float(np.abs(actual[:,:,:3].astype(float)-expected[:,:,:3])[opaque].mean())
            assert alpha_equal and error<8,(piece['id'],alpha_equal,error)
            pixels[piece['id']]={'alphaIdentical':alpha_equal,'meanRgbError':error}
        report={'phase':args.phase,'mismatchedDraws':mismatches,'drawStats':stats,'pixels':pixels}
        (root/'rebuild-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        page.locator('canvas').screenshot(path=str(root/'rebuild.png'))
        print(f'PASS {args.phase}: six PNGs rebuilt; {mismatches} mismatched draws; alpha and colors preserved',flush=True)


if __name__=='__main__':main()
