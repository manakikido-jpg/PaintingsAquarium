# 企画書PDFの作り方

会場へ渡す PDF（`docs/お絵かき水族館-企画書.pdf`・A4 5ページ）を作り直す手順。

## 原本はどれか

| ファイル | 役割 |
|---|---|
| `docs/企画書.md` | **文章の原本。** まずここを直す |
| `docs/企画書.html` | 体裁を整えた版。PDF と Web 版の元 |
| `docs/お絵かき水族館-企画書.pdf` | 会場へ渡すもの。下のコマンドで作る |
| Web版 | https://claude.ai/code/artifact/119fb141-8c35-4523-87f3-eddc68d7a4d8 |

`docs/企画書.html` は Artifact に置いてある Web 版と**同じ中身**。
文言を直したら、PDF と Web 版の両方を作り直す。

## コマンド

```bash
python3 tools/make-proposal-pdf.py
```

Chromium（`/opt/pw-browsers/`）と、Google Fonts を取りに行くための通信が要る。

## つまずいたところ（同じことを2回やった）

- **日本語が全部化けた** — `docs/企画書.html` には `<meta charset="utf-8">` が無い。
  Artifact は head を自動で足すので画面では正常に見えるが、`file://` で開くと
  Latin-1 と解釈されて化ける。スクリプトが印刷用コピーに charset を足している。
- **フォントが出ない** — Chromium はプロキシの証明書を信用しないので Google Fonts の
  取得に失敗し、既定のゴシックに落ちる。スクリプトは curl で先に落として data URI で
  埋め込む。使う文字だけを `text=` で切り出すので 300KB 程度で済む。
- **白いページが3枚できた** — 印刷CSSで `section { break-inside: avoid }` を全ての節に
  かけると、1ページに収まらない節が丸ごと次ページへ送られる。避けるのは表・箱・行など
  小さい単位だけにする（7ページ → 5ページ）。

## 確認のしかた

ページ数と、化けていないことを見る。

```bash
python3 -c "
import pypdfium2 as p
d = p.PdfDocument('docs/お絵かき水族館-企画書.pdf')
print('pages', len(d))
d[0].render(scale=1.2).to_pil().save('/tmp/pg1.png')"
```
