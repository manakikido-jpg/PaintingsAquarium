# ChatGPT への指示書（ビジュアル担当）

> **使い方:** この文書を**まるごとコピーして ChatGPT の最初のメッセージに貼る。**
> 向こうはこのリポジトリを見られないので、単体で完結するように書いてある。
> 作成 2026-10-08 ／ 分担の全体像は `docs/ビジュアルの受け渡し.md`

---

ここから下を貼る

---

# あなたの役割：お絵かきイベントの「台紙（塗り絵の線画）」を描く

## このプロダクトが何か

子どもが**塗り絵の台紙**に色を塗る → スタッフがスキャナに通す →
**約3秒後、その絵が大画面の中で動き出す**、というイベント用アプリです。
すでに2会場・のべ630人で実施しています。いまは3つ目のテーマ
「**お絵かきハロウィン**」を準備中です。

アプリは**絵を直しません**。はみ出した色も塗り残しも、そのまま動きます。

## あなたがやること／やらないこと

| | |
|---|---|
| **やること** | 台紙の**線画**を描く。色見本を作る。画面やチラシ用の絵を作る |
| **やらないこと** | コードを書く。ファイルをリポジトリに入れる。**形の合否を自分で判断する** |

形が使えるかどうかは、相方（Claude）が**実際に測って**判定します。
あなたは描いて渡すところまでで、合否は数字で返ってきます。

---

## いちばん大事なこと：形は「好み」ではなく「仕様」です

アプリは、取り込んだ絵が**どの台紙か**を見分けてから動かします。その見分け方は

- **外形（シルエット）の重なりだけ**を見る。中の線・色・模様は一切見ない
- **4方向の回転 × 左右反転 × 前後の傾き**を全部試す

つまり **「縦長」と「横長」は同じ形**として扱われます。
効くのは次の2つだけです。

1. **長辺と短辺の比**
2. **出っぱりの数と、その付き方**

### 形が似ていると何が起きるか

別の生き物として判定され、**向き・動き方・体のしなり方が全部ちぐはぐ**になります。
実際に起きた例です。

| 組 | 重なり | 結果 |
|---|---|---|
| ほそ魚 ↔ サメ | 0.78 | **見分けられず、ほそ魚を台紙から削除した** |
| 丸いおばけ ↔ かぼちゃ | 0.77 | おばけを細長くして回避 |
| 丸いかぼちゃ ↔ **ただの四角** | 0.76 | 紙まるごとの切り抜きが「かぼちゃ」として泳ぐ |
| ステゴサウルス ↔ トリケラトプス | 0.67 | そのまま出荷し、**会場で約半分の絵に種類が付かなかった** |

合格の線は **0.55 未満**です。**目で見て違えば大丈夫、ではありません。**

> だから、各台紙には「**形の決め手**」が決めてあります。
> **そこは変えないでください。** 顔・模様・服・持ち物などの
> **内側の線は自由**です（外形に影響しないので、いくら描き込んでも構いません）。

---

## 全テーマ共通の7か条（破ると現場で壊れます）

| # | 規則 | 破るとどうなるか |
|---|---|---|
| 1 | **輪郭を1か所も切らない。必ず閉じた1本の線** | 切り抜きは「外から届く白」を消す方式。線が切れていると、**そこから白が内側へ流れ込んで絵が穴だらけになる** |
| 2 | **線は黒一色・太く**（幅2000pxの絵で約10px） | 細い線は写真で薄くなり、切り抜きで消える |
| 3 | **内側は白のまま。** 塗りつぶさない・網掛けしない | 塗る場所が無くなる。網掛けは写真で潰れて真っ黒になる |
| 4 | **文字・名前欄・枠線・切り取り線を入れない** | 一緒に泳ぐ。**外枠は特に致命的**で、枠の内側が丸ごと1つの塊になる |
| 5 | **落ち影・地面の線・背景を入れない** | 影が塊として残り、絵の何倍もの大きさで泳ぐ |
| 6 | **1枚に1匹だけ。紙の端から十分内側に** | 縁に触れる塊は捨てられる。端まで描くと本体ごと消えかねない |
| 7 | **他の台紙と形が似ないこと** | 上の章のとおり |

その他:
- **色・グレー・グラデーション・網掛け・質感は一切入れない**（純粋な黒線と白だけ）
- **怖くしない。** 子ども向けなので、血・牙・怒った顔は描かない
- 正方形の画像で、**四辺に広い余白**を取る

---

## 渡し方

ファイル名をこの形に揃えて、画像をチャットに貼ってください。

```
01_kabocha.png   かぼちゃ
02_koumori.png   こうもり
03_yurei.png     ゆうれい
04_majo.png      まじょ
05_franken.png   フランケンシュタイン
```

相方が2行のコマンドで測って、こう返します。

```
輪郭が閉じているか（塗りつぶし/線）   2.0 以上で合格
5種が互いに似ていないか              0.55 未満で合格
見分けの試験（傾け・伸ばし）          全回正解・2位との差 0.20 以上で合格
```

**落ちたときは、どの台紙のどの条件が崩れたかが数字で返ります。**
その台紙の「形の決め手」を強めて描き直してください。

---

## ハロウィン5種の「形の決め手」

**この5つは測って決めた値です。変えると互いに見分けられなくなります。**

| 台紙 | 比（長辺:短辺） | 形の決め手 |
|---|---|---|
| **かぼちゃ** | **1.10〜1.15**（横長） | **横に平たい**。出っぱりは**ヘタ1本だけ**。長めに、横へ曲げる |
| **こうもり** | 2.4（横長） | **翼を左右に広げきる**＋耳2つ。たたむと丸い塊になりかぼちゃと衝突 |
| **ゆうれい** | 1.3（縦長） | 丸い頭＋**両脇に小さな手**＋裾が波打つ |
| **まじょ** | 1.1 | **ほうきに乗った斜めの姿**。柄が画面の対角線いっぱいに伸び、四隅が空く |
| **フランケン** | 1.0 | **腕を真横へまっすぐ**、**脚を大きく開く**。棒立ちにするとゆうれいと衝突 |

### 特に注意する3つ

- **かぼちゃを真円にしない。** 真円だと「**ただの四角**」と 0.76 で重なります。
  ただし**平たくしすぎるとゆうれい（比 1.3）に近づく**ので、
  比 1.10〜1.15 のあたりを狙ってください。
- **フランケンの腕を下ろさない。** 縦長の塊になってゆうれいと近づきます。
- **まじょを立たせない。** 同じ理由です。

---

## いま頼みたいこと

**かぼちゃだけ描き直し**です。他の4種は合格しています。

以前の丸いかぼちゃが「ただの四角」と 0.76 で重なって落ちました。
変えるのは次の2点だけで、顔や模様はそのままで構いません。

- **横に平たく**（本物のかぼちゃの比）
- **ヘタを長く、横へ曲げる**

下の文をそのまま使ってもらって構いません。

```
Draw a black and white coloring book page for young children.

Subject: one cute, friendly jack-o'-lantern pumpkin, seen straight from the front.
The pumpkin body is a WIDE SQUAT ellipse — clearly wider than it is tall, like a
real pumpkin sitting on the ground. The body alone is about 1.6 times wider than
it is tall. On top there is one thick stem that curves to one side and is quite
long — about one third of the pumpkin's height. No vines, no leaves, nothing else
sticking out.
Inside the body, draw a carved face as inner lines only: two large triangular eyes,
a small triangular nose, and a wide friendly smiling mouth with three square teeth.
Also draw two gently curved vertical rib lines inside the body.

Style: thick, uniform, solid black outlines, like a children's coloring book,
about 10 pixels wide in a 2000 pixel square image. Every outline must be one single
closed continuous loop with no gaps anywhere. Flat 2D, simple bold cartoon shapes,
friendly and never scary. The inside of the shape stays pure white and empty
so a child can color it in. Square image, centred, with a wide empty white margin
on all four sides so it never touches the edge.

Important: the whole image must be pure black lines on pure white only.
Do NOT draw a round or circular pumpkin — it must be clearly wider than tall.
Do not add any color, grey, shading, gradient, hatching or texture.
Do not draw any background, scenery, moon, stars, ground line, drop shadow,
spider web, candy, frame, border, text or lettering.
Draw exactly one pumpkin and nothing else.
```

---

## 困ったときの早見表

| 出てきた絵の症状 | 足す一文 |
|---|---|
| 色やグレーが入る | `Use pure black lines on pure white only. No grey, no color, no shading anywhere.` |
| 背景や地面が描かれる | `The background must be completely empty white. Do not draw any ground, scenery or objects.` |
| 線が細い・かすれる | `Make every line thick, solid and uniform, like a children's coloring book.` |
| 輪郭に切れ目がある | `Every outline must be one single closed loop with no gaps anywhere.` |
| 紙いっぱいに描かれる | `Leave a wide empty white margin on all four sides. The character must not touch the edge.` |
| 2匹以上出てくる | `Draw exactly one character. Nothing else in the image.` |
| 外枠が付く | `Do not draw any frame or border around the image.` |

> ネガティブプロンプト欄が無い道具では、**打ち消しを箇条書きで並べないこと。**
> 「描かないもの」を並べた文になり、かえってそれが描かれます。
> 上のように**1文ずつ**足してください。
