#!/usr/bin/env python3
"""企画書の HTML から、会場に渡す PDF を作る。

    python3 tools/make-proposal-pdf.py

なぜこのスクリプトが要るか（手で印刷すると2回とも同じ失敗をした）:

1. **文字化け** — `docs/企画書.html` には `<meta charset>` を書いていない。
   公開先（Artifact）は head を自動で足すので画面では正常に見えるが、
   `file://` で開くと Latin-1 と解釈されて日本語が全部化ける。
   → 印刷用のコピーを作るときに charset を先頭へ足す。
2. **フォントが出ない** — Chromium はプロキシの証明書を信用しないため
   Google Fonts の取得に失敗し、既定のゴシックに落ちる。
   → curl（証明書を持っている）で先に落とし、data URI で埋め込む。
   使っている文字だけを `text=` で切り出すので、5書体で 300KB 程度に収まる。
"""

import base64
import pathlib
import re
import subprocess
import sys
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs' / '企画書.html'
OUTPUT = ROOT / 'docs' / 'お絵かき水族館-企画書.pdf'
CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
FAMILIES = 'family=Noto+Sans+JP:wght@400;500;700&family=Zen+Maru+Gothic:wght@500;700'
# 記号やラテン文字は本文に出てこなくても CSS の counter などで使う
ALWAYS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789().,-/:%'
UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')


def fetch(url: str) -> bytes:
    done = subprocess.run(['curl', '-sS', '--max-time', '60', '-A', UA, url],
                          capture_output=True)
    if done.returncode != 0 or not done.stdout:
        sys.exit(f'取得に失敗しました: {url}\n{done.stderr.decode()}')
    return done.stdout


def used_characters(html: str) -> str:
    body = html.split('</style>', 1)[-1]
    text = re.sub(r'<[^>]+>', '', body)
    return ''.join(sorted(set(text + ALWAYS) - set(' \t\r\n')))


def inline_fonts(html: str) -> str:
    url = (f'https://fonts.googleapis.com/css2?{FAMILIES}&display=swap&text='
           + urllib.parse.quote(used_characters(html)))
    css = fetch(url).decode()
    for font in sorted(set(re.findall(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', css))):
        data = base64.b64encode(fetch(font)).decode()
        css = css.replace(font, 'data:font/woff2;base64,' + data)
    stripped = re.sub(r'<link rel="(?:preconnect|stylesheet)"[^>]*>\n?', '', html)
    return '<meta charset="utf-8">\n<style>\n' + css + '\n</style>\n' + stripped


def main() -> None:
    html = SOURCE.read_text(encoding='utf-8')
    printable = ROOT / 'docs' / '.企画書-印刷用.html'
    printable.write_text(inline_fonts(html), encoding='utf-8')
    done = subprocess.run([
        CHROME, '--headless=new', '--no-sandbox', '--disable-gpu',
        '--no-pdf-header-footer',
        # 埋め込み画像とフォントの読み込みを待たずに印刷すると白く抜ける
        '--virtual-time-budget=25000', '--run-all-compositor-stages-before-draw',
        f'--print-to-pdf={OUTPUT}', printable.as_uri(),
    ], capture_output=True)
    printable.unlink()
    if not OUTPUT.exists():
        sys.exit('PDF を作れませんでした\n' + done.stderr.decode()[-2000:])
    print(f'{OUTPUT}  {OUTPUT.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
