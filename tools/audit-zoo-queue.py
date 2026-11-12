#!/usr/bin/env python3
"""監査用の空プロファイルで、画像処理待ち中のテーマ切り替えを実操作で検査する。"""
import argparse
import json
from pathlib import Path
import shutil
import time
from playwright.sync_api import sync_playwright

SLOW_IMAGES = '''const NativeImage=window.Image;
window.Image=function(...args){const image=new NativeImage(...args);let loaded=null;
Object.defineProperty(image,'onload',{configurable:true,get(){return loaded},set(fn){loaded=fn}});
image.addEventListener('load',event=>setTimeout(()=>{if(loaded)loaded.call(image,event)},2000));return image};
window.Image.prototype=NativeImage.prototype;'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', type=Path)
    parser.add_argument('--fixtures',type=Path,required=True)
    parser.add_argument('--cdp',required=True)
    parser.add_argument('--phase',choices=['before','after'],required=True)
    args=parser.parse_args()
    root=args.out.resolve()
    with sync_playwright() as p:
        b=p.chromium.connect_over_cdp(args.cdp);page=b.contexts[0].pages[0]
        page.wait_for_function('typeof window.aquarium !== "undefined"')
        settings=page.evaluate('()=>window.aquarium.getSettings()')
        assert settings['watchFolder']==str(root/'inbox') and settings['theme']=='zoo'
        assert page.evaluate('()=>window.aquarium.listPieces()')==[]
        page.add_init_script(SLOW_IMAGES)
        page.reload();page.wait_for_function('typeof window.aquarium !== "undefined"')
        page.keyboard.press('s')
        page.evaluate('''()=>{window.arrivals=[];window.aquarium.onIncoming(photo=>{
          window.arrivals.push({name:photo.fileName,theme:photo.ingestSettings?.theme});
          if(window.arrivals.length===13){[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='水族館').click();}
        })}''')
        (root/'inbox/00-broken.jpg').write_bytes(b'not an image')
        page.wait_for_function('window.arrivals.length>=1', timeout=30000)
        sources=sorted(args.fixtures.glob('*-colored-cropped.png'))
        assert len(sources)==6
        for i,source in enumerate(sources):
            for copy in range(2):shutil.copyfile(source,root/'inbox'/f'{i:02}-{copy}-{source.name}')
        page.wait_for_function('window.arrivals.length===13',timeout=30000)
        page.wait_for_function('async()=> (await window.aquarium.getSettings()).theme === "aquarium"')
        deadline=time.monotonic()+150
        while True:
            pieces=page.evaluate('()=>window.aquarium.listPieces()')
            if len(pieces)==12:break
            assert time.monotonic()<deadline,('queue stopped',len(pieces))
            page.wait_for_timeout(500)
        arrivals=page.evaluate('window.arrivals')
        counts={}
        for piece in pieces:counts[piece.get('theme')]=counts.get(piece.get('theme'),0)+1
        if args.phase=='after':
            assert counts=={'zoo':12},counts
            assert all(a['theme']=='zoo' for a in arrivals),arrivals
            assert all(piece.get('species')==piece['fileName'].split('-',2)[2].split('-',1)[0] for piece in pieces)
        else:assert counts.get('aquarium',0)>0,counts
        report={'savedThemes':counts,'arrivals':arrivals,'pieces':pieces}
        (root/'queue-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(f'PASS {args.phase}: broken image rejected, 12 subsequent images saved; themes {counts}',flush=True)


if __name__=='__main__':main()
