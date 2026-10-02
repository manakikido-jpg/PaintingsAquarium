# ハロウィンの台紙：Gemini にそのまま貼るプロンプト

- 作成: 2026-10-02
- 形の根拠: `docs/設計-ハロウィンの台紙.md`（**なぜその形なのかはそちら**）
- 作ったあとに必ず測る: `python3 tools/check-templates.py <フォルダ>`

---

## 使い方

**1種につき1つの塊を、まるごとコピーして貼る。** 共通部分も中に入れてあるので、
**他のものと組み合わせる必要はない**。1枚ずつ、5回に分けて出す。

### Gemini 向けにしてあること

| | 理由 |
|---|---|
| **打ち消しを本文の最後に1文でまとめた** | Gemini には**ネガティブプロンプト欄が無い**。「描かないもの」を箇条書きで並べると、かえってそれが描かれる |
| **背景を「何も無い真っ白」と明言した** | 放っておくと満月・墓場・クモの巣を描き足す。それが絵として一緒に泳いでしまう |
| **形の条件を数字で書いた** | 「縦長に」では足りない。**何倍か**まで書かないと丸い絵が返ってくる |
| **`friendly, never scary` を全部に入れた** | 子どもが塗る紙なので |

### 出てきた絵がおかしいとき

| 症状 | 足す一文 |
|---|---|
| 色やグレーが入る | `Use pure black lines on pure white only. No grey, no color, no shading anywhere.` |
| 背景や地面が描かれる | `The background must be completely empty white. Do not draw any ground, scenery or objects.` |
| 線が細い・かすれる | `Make every line thick, solid and uniform, like a children's coloring book.` |
| 輪郭に切れ目がある | `Every outline must be one single closed loop with no gaps anywhere.` |
| 紙いっぱいに描かれる | `Leave a wide empty white margin on all four sides. The character must not touch the edge.` |
| 2匹以上出てくる | `Draw exactly one character. Nothing else in the image.` |

---

## 1. かぼちゃ

> **形の決め手**: ほぼ真円（縦横が同じ）。外へ出る出っぱりは**ヘタ1本だけ**。
> つるや葉を横へ伸ばすと、クモやフランケンの腕と紛らわしくなる。

```
Draw a black and white coloring book page for young children.

Subject: one cute, friendly jack-o'-lantern pumpkin, seen straight from the front.
The pumpkin body is an almost perfect circle, exactly as wide as it is tall.
It has one short thick stem pointing straight up from the top, and nothing else
sticking out — no vines, no leaves, no tendrils.
Inside the body, draw a carved face as inner lines only: two large triangular eyes,
a small triangular nose, and a wide friendly smiling mouth with three square teeth.
Also draw two gently curved vertical rib lines inside the body.

Style: thick, uniform, solid black outlines, like a children's coloring book,
about 10 pixels wide in a 2000 pixel square image. Every outline must be one single
closed continuous loop with no gaps anywhere. Flat 2D, simple bold cartoon shapes,
friendly and never scary. The inside of the shape stays pure white and empty
so a child can color it in. Square image, the pumpkin centred, with a wide empty
white margin on all four sides so it never touches the edge.

Important: the whole image must be pure black lines on pure white only.
Do not add any color, grey, shading, gradient, hatching or texture.
Do not draw any background, scenery, moon, stars, night sky, ground line,
drop shadow, spider web, candy, frame, border, text or lettering.
Draw exactly one pumpkin and nothing else.
```

---

## 2. こうもり

> **形の決め手**: **翼を広げきる**（横が縦の約2.2倍）。
> たたんだ翼にすると丸い塊になり、かぼちゃと見分けがつかなくなる。

```
Draw a black and white coloring book page for young children.

Subject: one cute, friendly cartoon bat, seen from the front, with both wings
fully spread wide open. The whole shape is very wide and flat — about 2.2 times
wider than it is tall. The body is a small rounded shape in the centre, with two
pointed ears on top of the head. Each wing is much wider than the body and reaches
far out to the left and right, held out horizontally like a glider. The lower edge
of each wing is cut into two or three rounded scallops. Inside each wing, draw two
simple wing-bone lines. The face has two big round friendly eyes, a small smiling
mouth and two tiny rounded fangs.

Style: thick, uniform, solid black outlines, like a children's coloring book,
about 10 pixels wide in a 2000 pixel square image. Every outline must be one single
closed continuous loop with no gaps anywhere. Flat 2D, simple bold cartoon shapes,
friendly and never scary. The inside of the shape stays pure white and empty
so a child can color it in. Square image, the bat centred, with a wide empty
white margin on all four sides so it never touches the edge.

Important: the whole image must be pure black lines on pure white only.
Do not add any color, grey, shading, gradient, hatching or texture.
Do not draw any background, scenery, moon, stars, night sky, ground line,
drop shadow, spider web, frame, border, text or lettering.
Draw exactly one bat and nothing else — no extra bats in the sky.
```

---

## 3. ゆうれい

> **いちばん壊れやすいのがこれ。** ふわっとした丸いおばけにすると、
> 回したときに**かぼちゃと同じ丸**になり、重なり 0.77 まで上がって見分けが落ちる。
> **縦に2.5倍・裾の切れ込みは布の幅の3分の1以上**えぐること。腕を付けないこと。

```
Draw a black and white coloring book page for young children.

Subject: one cute, friendly cartoon ghost, shaped like a tall narrow hanging sheet.
The shape is clearly much taller than it is wide — about two and a half times
taller than wide, like a narrow column. The top is a smooth rounded dome and the
two sides run straight down, parallel to each other. The bottom hem is cut into
exactly three large rounded waves, separated by deep narrow notches that cut far
up into the sheet; each notch is at least one third as deep as the sheet is wide.
The ghost has no arms and no hands — nothing sticks out at the sides at all.
The face has two large oval eyes and a small round open mouth, drawn as inner lines.

Style: thick, uniform, solid black outlines, like a children's coloring book,
about 10 pixels wide in a 2000 pixel square image. Every outline must be one single
closed continuous loop with no gaps anywhere. Flat 2D, simple bold cartoon shapes,
friendly and never scary. The inside of the shape stays pure white and empty
so a child can color it in. Square image, the ghost centred, with a wide empty
white margin on all four sides so it never touches the edge.

Important: the whole image must be pure black lines on pure white only.
Do not add any color, grey, shading, gradient, hatching or texture.
Do not make the ghost round or blob-shaped — it must be tall and narrow with a
deeply notched bottom. Do not give it arms.
Do not draw any background, scenery, moon, stars, night sky, ground line,
drop shadow, frame, border, text or lettering.
Draw exactly one ghost and nothing else.
```

---

## 4. まじょ

> **立ち姿にしないこと。** 立たせると縦長の塊になり、ゆうれいと衝突する。
> **ほうきの柄が画面の対角線いっぱいに伸びている**のが形の決め手で、
> 四隅が白く空いている「すかすかな形」が、他の4種すべてから離している。

```
Draw a black and white coloring book page for young children.

Subject: one cute, friendly cartoon witch girl riding a broomstick, seen from the side,
flying. The broomstick is a long straight thin stick that runs diagonally all the way
across the image, from the lower left corner up to the upper right corner, and the
bristles fan out at the upper right end. The witch sits on the middle of the stick,
leaning slightly forward. She wears a tall pointed witch hat with a wide flat brim,
and a cloak that streams out behind her to the left. Her legs are bent and point
forward along the stick, with a pointed boot at the end. One hand holds the stick
in front of her. Her face has one round eye and a smiling mouth.
Because the witch and the broom lie along the diagonal, the four corners of the
image are mostly empty white space — keep it that way.

Style: thick, uniform, solid black outlines, like a children's coloring book,
about 10 pixels wide in a 2000 pixel square image. Every outline must be one single
closed continuous loop with no gaps anywhere. Flat 2D, simple bold cartoon shapes,
friendly and never scary. The inside of the shape stays pure white and empty
so a child can color it in. Square image, with a wide empty white margin on all
four sides so nothing touches the edge.

Important: the whole image must be pure black lines on pure white only.
Do not draw the witch standing up — she must be sitting on the broom, flying,
with the broom running corner to corner across the picture.
Do not add any color, grey, shading, gradient, hatching or texture.
Do not draw any background, scenery, moon, stars, night sky, clouds, ground line,
drop shadow, frame, border, text or lettering.
Draw exactly one witch on one broom and nothing else — no cat, no bats.
```

---

## 5. フランケンシュタイン

> **棒立ちにしないこと。** 腕を下ろすと縦長の塊になり、ゆうれいと近づく。
> **腕は肩から真横へまっすぐ**、**脚は間をはっきり空けて**描く。
> 出っぱりが上下左右の4方向にあることが、ゆうれいとの衝突を防いでいる。

```
Draw a black and white coloring book page for young children.

Subject: one cute, friendly cartoon Frankenstein's monster boy, seen from the front,
standing with both arms held straight out horizontally to the left and right at
shoulder height, like a letter T. His hands are simple square mitts at the ends of
the arms. He has two thick straight legs set far apart with a clear wide gap between
them, and big flat boots. His head is a flat square block with a straight flat top
and a straight fringe of hair; draw a few short vertical hair lines inside it.
Two small bolts stick straight out sideways from both sides of his neck.
His face has two round friendly eyes and a small smiling mouth.
He wears a simple jacket; draw the collar line, the front opening and a few short
stitch marks as inner lines. The whole figure is about as wide as it is tall.

Style: thick, uniform, solid black outlines, like a children's coloring book,
about 10 pixels wide in a 2000 pixel square image. Every outline must be one single
closed continuous loop with no gaps anywhere. Flat 2D, simple bold cartoon shapes,
friendly and never scary — he is a cheerful cartoon character, not a horror monster.
The inside of the shape stays pure white and empty so a child can color it in.
Square image, centred, with a wide empty white margin on all four sides so he
never touches the edge.

Important: the whole image must be pure black lines on pure white only.
Do not draw him with his arms down at his sides — both arms must point straight
out sideways, and his legs must be clearly apart with a gap between them.
Do not add any color, grey, shading, gradient, hatching or texture.
Do not draw any background, scenery, moon, stars, night sky, ground line,
drop shadow, frame, border, text or lettering.
Do not make him scary — no blood, no sharp teeth, no angry face.
Draw exactly one character and nothing else.
```

---

## 出てきたら

1. 5枚を1つのフォルダに入れる（名前は `01_kabocha.png` … `05_franken.png`）
2. `python3 tools/check-templates.py <そのフォルダ>`
3. 合格の線は3つ

   | 見るもの | 合格 |
   |---|---|
   | 輪郭が閉じているか（塗りつぶし/線） | **2.0 以上** |
   | 5種が互いに似ていないか | **0.55 未満** |
   | 見分けの試験 | **全回正解・2位との差 0.20 以上** |

4. 落ちた種類は、上の「> **形の決め手**」の条件が守られているかを先に見る。
   守られていなければ、その条件の文を**プロンプトの先頭近くへ移して**出し直す。

> **コードで描いた版が `assets/templates/halloween/` に入っている。**
> （`tools/draw-halloween-art.py`。測定は合格済みで、全組 0.54 以下・差 +0.30）
> 生成した絵のほうがよければ差し替える。**まじょだけは生成版のほうがよいはず。**
