#!/usr/bin/env python3
"""現在の動物園素材をそのまま発注用ZIPにまとめる。依存: PyMuPDF, fontTools, Pillow。"""
import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import zipfile

import fitz
from fontTools import subset
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ANIMALS = [('01_zou.png','ぞう'), ('02_raion.png','ライオン'), ('03_kirin.png','キリン'),
           ('04_saru.png','さる'), ('05_panda.png','パンダ'), ('06_shimauma.png','しまうま')]
TITLE = 'お絵描き動物園｜発注用素材・見本'
BRIEF = '''制作の対象
幼児が色を塗り、スキャンすると画面で歩く動物の線画6種類。親しみやすく、怖くない、シンプルな絵柄でお願いします。添付PNGは現在の見本です。

共通の描き方
・左向きの横姿を基本とした全身。足と足の間にすき間を作り、四足が分かる姿勢。
・太く均一な黒線、白い内部。グレーの塗り、影、模様の描き込みを控え、塗れる面を広く。
・外側の輪郭を閉じる。絵が画像端に触れないよう、四方に白い余白を残す。
・原画にはタイトル、名前欄、外枠、地面の線を入れない。印刷用の文字は別工程で配置。
・胴、顔、首、ぞうの鼻は固定。足元だけを交互に動かしやすい形にする。
・しっぽは体の右側へ出し、胴や脚に重なりすぎないようにする。付け根が分かる形にする。

動物ごとの要点
ぞう：大きな耳と鼻。鼻は固定し、足元と右側のしっぽを動かす。
ライオン：丸いたてがみと、先のふさが分かる右側のしっぽ。
キリン：長い首を固定し、離れた足と右側のしっぽが分かる姿。
さる：四つん這いで歩く姿。前足と後ろ足が分かり、巻いたしっぽは右側へコンパクトに。
パンダ：模様も塗れる面を残し、小さなしっぽが右側に見える姿。
しまうま：細かすぎない縞の輪郭。脚のすき間と右側のしっぽを保つ。

お願いしたい納品形式
各動物1ファイルのPNG（RGB・白背景）。現行見本の縦横比と余白を参考に、長辺3000px以上を目安とする。編集可能な元データ（AI／SVG／PSD等）も可能な形式で併せて納品。胴・足・しっぽを分けられる元データがあると修正しやすくなります。

印刷時の配置
A4横・297×210mm。左上に「お絵描き動物園」、その下に「すきな いろで ぬってね」。動物は利用可能な範囲の約70％。添付の6ページPDFを配置見本にします。

描き直し後の組み込み
新しい輪郭に合わせ、アプリの種類判定と足・しっぽの動く位置を更新して再検証します。新しいPNGへの差し替えだけで現在と同じ動きになるとは限りません。着色GIFは動きの参考で、線画の納品は白黒です。'''
BACKGROUND = '''背景も制作を依頼する場合の参考
入口ゲート、柵、小道、左右の木、案内板がある明るい動物園。動物が歩く中央の草地を広く空けます。重要な看板や飾りは画面端に寄せず、横長画面でのトリミングに余裕を持たせます。

動く雲は、固定背景と分けた透過PNGにします。雲や鳥を背景へ固定して描き込むことは避けます。現在の鳥はアプリで描画しているため、鳥の画像ファイルは入っていません。

参考素材：背景 1672×941px、雲 2172×724px（透過あり）。新作の背景サイズは会場の画面サイズに合わせて決めます。'''
INTRO = '現在の6種類の線画。原寸PNGは「01_lineart」に入っています。'
FILES = '''同梱内容
00_発注ガイド.pdf：6種一覧、制作条件、背景の参考（3ページ）
00_発注ガイド.txt：この説明と制作条件（UTF-8）
01_lineart：現在の原寸・白黒PNG 6枚
02_print：A4横・6ページの印刷台紙PDF（等倍・片面）
03_background_reference：現在の固定背景と透過の雲
04_motion_reference：色付き見本が歩くGIF
manifest.json：各ファイルのサイズとSHA-256

このZIPを展開し、最初に00_発注ガイド.pdfを開いてください。
現在の素材はPNGです。AI／SVG／PSDなどの編集可能な原稿は含まれていません。
'''
MESSAGE = '''発注先へ送る文面の例
添付の見本を参考に、子ども向け塗り絵「お絵描き動物園」の動物6種類の線画制作をお願いします。色を塗ってスキャンし、画面で足としっぽを動かして使用します。向き・姿勢・余白と納品形式は「00_発注ガイド.pdf」をご確認のうえ、お見積りと制作日程をご相談させてください。背景も依頼する場合は、背景参考素材もご確認ください。
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', required=True, type=date.fromisoformat)
    parser.add_argument('--out', type=Path, default=ROOT/'docs/hand-off')
    args = parser.parse_args(); stamp = args.date.isoformat(); out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='zoo-order-') as temporary:
        work = Path(temporary); pack = work/f'zoo-order-materials-{stamp}'; pack.mkdir()
        for folder in ['01_lineart','02_print','03_background_reference','04_motion_reference']:
            (pack/folder).mkdir()
        for file, _ in ANIMALS:
            shutil.copyfile(ROOT/'assets/templates/zoo'/file, pack/'01_lineart'/file)
        shutil.copyfile(ROOT/'docs/お絵描き動物園-台紙.pdf', pack/'02_print/お絵描き動物園-台紙_A4横.pdf')
        for file in ['zoo-background.png','zoo-cloud.png']:
            shutil.copyfile(ROOT/'assets/scene'/file, pack/'03_background_reference'/file)
        shutil.copyfile(ROOT/'docs/previews/zoo-moving-sky.gif', pack/'04_motion_reference/zoo-moving-sky.gif')
        readme = f'{TITLE}\n作成日：{stamp}\n\n{FILES}\n{BRIEF}\n\n{BACKGROUND}\n\n{MESSAGE}'
        (pack/'00_発注ガイド.txt').write_text(readme, encoding='utf-8-sig')

        # CJKコレクションをPDFへ丸ごと渡すと巨大化し、一部のサブセット処理も失敗する。
        # 必要な日本語字形を先に絞り、閲覧PCのフォントに依存しない形で埋め込む。
        all_text = readme + INTRO + '別素材の雲（青い下地は透過を見やすくする表示用）' + '背景の見本固定背景参考雲透過素材制作条件原寸見本一覧' + ''.join(name for _, name in ANIMALS)
        all_text += ''.join(chr(i) for i in range(32,127))
        source_font = Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
        font = TTFont(source_font, fontNumber=0)
        # CIDフォントの字形番号を保たないと、文字抽出できても日本語だけ描画されない。
        options = subset.Options(); options.retain_gids = True
        subsetter = subset.Subsetter(options); subsetter.populate(text=all_text); subsetter.subset(font)
        font_file = work/'jp-subset.otf'; font.save(font_file)
        doc = fitz.open(); width, height = fitz.paper_size('a4')
        def page(title, number):
            p = doc.new_page(width=width, height=height)
            p.insert_font(fontname='JP',fontfile=str(font_file))
            p.insert_text((36,49),title,fontname='JP',fontsize=17)
            p.insert_text((36,height-25),f'{TITLE}  {stamp}   {number}/3',fontname='JP',fontsize=8)
            return p
        def text(p, rect, content, size=10):
            remaining=p.insert_textbox(fitz.Rect(rect),content,fontname='JP',fontsize=size,lineheight=1.5)
            if remaining<0:raise RuntimeError(f'PDFの文章が収まりません: {content[:30]}')
        def preview(p, rect, file, edge=900, alpha=False):
            # PDF内の一覧だけ適切な解像度へ縮める。ZIPの原寸PNGは一切変えない。
            with fitz.open(file) as image_doc:
                image_page=image_doc[0]
                factor=min(1,edge/max(image_page.rect.width,image_page.rect.height))
                pixels=image_page.get_pixmap(matrix=fitz.Matrix(factor,factor),alpha=alpha)
                p.insert_image(fitz.Rect(rect),stream=pixels.tobytes('png'))
        p = page('お絵描き動物園｜6種の原画見本',1)
        text(p,(36,65,width-36,92),INTRO,9)
        card_w=(width-84)/2
        for i,(file,name) in enumerate(ANIMALS):
            x=36+(i%2)*(card_w+12); y=101+(i//2)*229
            p.draw_rect(fitz.Rect(x,y,x+card_w,y+216),color=(.8,.8,.8),width=.5)
            preview(p,(x+9,y+8,x+card_w-9,y+173),pack/'01_lineart'/file)
            p.insert_text((x+10,y+190),f'{i+1:02}  {name}',fontname='JP',fontsize=12)
            with Image.open(pack/'01_lineart'/file) as image:
                dimensions=f'{image.width} x {image.height} px  /  {file}'
            p.insert_text((x+10,y+205),dimensions,fontname='JP',fontsize=8)
        p = page('制作条件・納品のお願い',2)
        text(p,(36,70,width-36,height-47),BRIEF,9.5)
        p = page('背景の参考（背景も依頼する場合）',3)
        preview(p,(36,76,width-36,370),pack/'03_background_reference/zoo-background.png',edge=1200)
        p.insert_text((36,390),'固定背景の参考',fontname='JP',fontsize=10)
        cloud_rect=fitz.Rect(36,410,width-36,503)
        p.draw_rect(cloud_rect,color=None,fill=(.75,.88,.98))
        preview(p,cloud_rect,pack/'03_background_reference/zoo-cloud.png',edge=1200,alpha=True)
        p.insert_text((36,523),'別素材の雲（青い下地は透過を見やすくする表示用）',fontname='JP',fontsize=9)
        text(p,(36,545,width-36,height-48),BACKGROUND,10)
        guide=pack/'00_発注ガイド.pdf';doc.save(guide,garbage=4,deflate=True);doc.close()
        shutil.copyfile(guide,out/f'zoo-order-guide-{stamp}.pdf')
        manifest=[]
        for file in sorted(pack.rglob('*')):
            if file.is_file():
                content=file.read_bytes()
                manifest.append({'path':file.relative_to(pack).as_posix(),'bytes':len(content),
                                 'sha256':hashlib.sha256(content).hexdigest()})
        (pack/'manifest.json').write_text(json.dumps({'date':stamp,'files':manifest},ensure_ascii=False,indent=2),encoding='utf-8')
        archive=out/f'zoo-order-materials-{stamp}.zip'
        with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
            for file in sorted(pack.rglob('*')):
                if file.is_file():z.write(file,file.relative_to(work))
        with zipfile.ZipFile(archive) as z:
            assert z.testzip() is None
        print(f'{archive}: {archive.stat().st_size:,} bytes; {len(manifest)+1} files')
        print(out/f'zoo-order-guide-{stamp}.pdf')


if __name__=='__main__':main()
