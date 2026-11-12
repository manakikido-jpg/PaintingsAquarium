#!/usr/bin/env python3
"""空の隔離プロファイルで、配布前のテーマ切替・6種取り込み・動作と設定保存を検査する。"""
import argparse
import json
from pathlib import Path
import time
from playwright.sync_api import sync_playwright

PROBE='''()=>{window.releaseSmoke={positions:{},background:false,cloudFrames:[],cloudMin:Infinity};
const draw=CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
 const src=typeof image.src==='string'?image.src:'';
 if(src.includes('zoo-background'))window.releaseSmoke.background=true;
 if(src.includes('zoo-cloud'))window.releaseSmoke.cloudMin=Math.min(window.releaseSmoke.cloudMin,args[0]);
 if(src.startsWith('aqua://piece/')&&args.length===8&&args[2]>image.naturalWidth*.7&&args[3]>image.naturalHeight*.5){
  const id=decodeURIComponent(new URL(src).pathname.slice(1)),m=this.getTransform();
  const values=window.releaseSmoke.positions[id]||(window.releaseSmoke.positions[id]=[]);
  const value=m.e.toFixed(2)+','+m.f.toFixed(2);if(values.at(-1)!==value){values.push(value);if(values.length>100)values.shift();}
 }
 return draw.call(this,image,...args);
};
const frame=window.requestAnimationFrame;
window.requestAnimationFrame=callback=>frame(t=>{window.releaseSmoke.cloudMin=Infinity;callback(t);
 if(Number.isFinite(window.releaseSmoke.cloudMin)&&window.releaseSmoke.cloudFrames.length<100)
 window.releaseSmoke.cloudFrames.push(window.releaseSmoke.cloudMin);});}'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out',type=Path)
    parser.add_argument('--fixtures',type=Path,required=True)
    parser.add_argument('--cdp',required=True)
    args=parser.parse_args();root=args.out.resolve()
    sources=sorted(args.fixtures.glob('color-*.png'));assert len(sources)==6
    with sync_playwright() as p:
        browser=p.chromium.connect_over_cdp(args.cdp);page=browser.contexts[0].pages[0]
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        page.wait_for_function('typeof window.aquarium!=="undefined"')
        location=page.evaluate('()=>window.aquarium.getStorageLocation()')
        settings=page.evaluate('()=>window.aquarium.getSettings()')
        assert location['dataRoot']==str(root/'profile/data') and settings['watchFolder']==str(root/'inbox')
        assert page.evaluate('()=>window.aquarium.listPieces()')==[]
        assert settings['theme']=='halloween','既存テーマを保持した起動から確認する'
        page.wait_for_selector('canvas');page.wait_for_timeout(200)
        page.keyboard.press('s')
        page.get_by_role('button',name='動物園',exact=True).click()
        def wait(check, message, timeout=90):
            deadline=time.monotonic()+timeout
            while not check():
                assert time.monotonic()<deadline,message
                page.wait_for_timeout(150)
        wait(lambda:page.evaluate('()=>window.aquarium.getSettings()')['theme']=='zoo','動物園へ切り替わらない')
        page.evaluate(PROBE)
        for source in sources:
            animal=source.stem.removeprefix('color-')
            (root/'inbox'/f'release-{animal}.png').write_bytes(source.read_bytes())
        wait(lambda:len(page.evaluate('()=>window.aquarium.listPieces()'))==6,'6枚の取り込みが完了しない')
        pieces=page.evaluate('()=>window.aquarium.listPieces()')
        assert all(x['theme']=='zoo' and x['species']==x['fileName'].removeprefix('release-').removesuffix('.png') for x in pieces)
        wait(lambda:len(page.evaluate('window.releaseSmoke.positions'))==6,'6種の描画が揃わない')
        page.wait_for_timeout(2000)
        motion=page.evaluate('window.releaseSmoke')
        assert all(len(v)>1 for v in motion['positions'].values()),motion
        assert motion['background'] and len(set(motion['cloudFrames']))>1,motion
        tail=page.get_by_role('checkbox',name='しっぽをゆっくり動かす')
        tail.uncheck()
        wait(lambda:page.evaluate('()=>window.aquarium.getSettings()')['zooTailMotion'] is False,'しっぽ設定が保存されない')
        before=page.evaluate('window.releaseSmoke.positions');page.wait_for_timeout(1500)
        after=page.evaluate('window.releaseSmoke.positions')
        assert all(after[key]!=before[key] for key in before),'しっぽ停止中に歩行も止まった'
        page.reload();page.wait_for_selector('canvas');page.wait_for_timeout(200)
        page.keyboard.press('s')
        tail=page.get_by_role('checkbox',name='しっぽをゆっくり動かす');assert not tail.is_checked()
        assert page.evaluate('()=>window.aquarium.listPieces()')==pieces
        tail.check()
        wait(lambda:page.evaluate('()=>window.aquarium.getSettings()')['zooTailMotion'] is True,'しっぽを再開できない')
        page.get_by_role('button',name='ハロウィン',exact=True).click()
        wait(lambda:page.evaluate('()=>window.aquarium.getSettings()')['theme']=='halloween','旧テーマへ戻せない')
        page.get_by_role('button',name='動物園',exact=True).click()
        wait(lambda:page.evaluate('()=>window.aquarium.getSettings()')['theme']=='zoo','動物園へ戻せない')
        page.evaluate('()=>window.aquarium.rescan()');page.wait_for_timeout(1500)
        assert page.evaluate('()=>window.aquarium.listPieces()')==pieces
        assert not errors,errors
        report={'saved':6,'speciesCorrect':True,'allSixMoved':True,'backgroundAndCloudsDrawn':True,
                'cloudsMoved':True,'tailPauseKeepsWalking':True,'settingsAndPiecesSurviveReload':True,
                'legacyThemeSwitchWorks':True,'rescanDuplicates':0,'rendererErrors':errors}
        (root/'smoke-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        page.keyboard.press('s');page.locator('canvas').screenshot(path=str(root/'zoo-release.png'))
        print(report,flush=True)


if __name__=='__main__':main()
