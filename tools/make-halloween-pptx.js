// お絵かきハロウィン 企画書（会場へ渡す用）
//
// 通年版（`make-proposal-pptx.js`）と**同じ部品**を使う（`proposal-deck.js`）。
// 違うのは配色と中身だけ。並べたときに揃っていないと素人仕事に見える。
//
// **実績の扱いだけは通年版と変えてある。** ハロウィンはまだ実施していないので、
// 630人は「通年版での実績」と断ったうえで載せる。ここをぼかすと現場で食い違う。
const pptx = require('pptxgenjs')
const path = require('path')

const ROOT = '/home/user/PaintingsAquarium'
const SHOT = path.join(ROOT, 'docs/images/画面-ハロウィン-開発中.jpg')
const SHOT_SHEETS = path.join(ROOT, 'docs/images/ハロウィン台紙5種.jpg')
const SHOT_TRANSFORM = path.join(ROOT, 'docs/images/変換前後.jpg')
const SHOT_GALLERY = path.join(ROOT, 'docs/images/いろいろな絵.jpg')
const OUT = path.join(ROOT, 'docs/お絵かきハロウィン-企画書.pptx')

// ハロウィンの画面そのものから採った色。夜空の紫を主役に、かぼちゃの橙を差し色にする
const PALETTE = {
  DEEP: '241348',
  SEA: '7A3FB5',
  AQUA: 'C4A3F0',
  INK: '201A2E',
  MUTE: '5B5270',
  LINE: 'E4DEEC',
  TINT: 'F5F0FB',
  WARM: 'E8653F',
  SHADOW: '2E1A4A',
}
const { DEEP, SEA, AQUA, INK, MUTE, LINE, TINT, WARM } = PALETTE
// 夜の画面に置くカードの色
const NIGHT_CARD = '3A2066'
const NIGHT_LINE = '55357F'
const NIGHT_TEXT = 'D9C9F2'

const p = new pptx()
p.layout = 'LAYOUT_WIDE'
p.author = 'お絵かきハロウィン'
p.title = 'お絵かきハロウィン 企画書'

const { FONT, W, H, M, shadow, slide, heading, card } = require('./proposal-deck')(p, PALETTE)

/* ------------------------------------------------------------------ 1 表紙 */
{
  const s = slide(true)
  s.addImage({ path: SHOT, x: 6.4, y: 0, w: W - 6.4, h: H, sizing: { type: 'cover', w: W - 6.4, h: H } })

  s.addText('10月の期間限定ワークショップのご提案', {
    x: M, y: 1.5, w: 6.2, h: 0.36, fontFace: FONT, fontSize: 14, bold: true,
    color: AQUA, charSpacing: 2, margin: 0,
  })
  s.addText('お絵かき\nハロウィン', {
    x: M, y: 1.95, w: 6.6, h: 1.55, fontFace: FONT, fontSize: 42, bold: true,
    color: 'FFFFFF', lineSpacing: 50, margin: 0,
  })
  s.addText('子どもが塗ったおばけが、その場で\n大画面の夜空をふわふわ漂い出します。', {
    x: M, y: 3.6, w: 5.3, h: 0.9, fontFace: FONT, fontSize: 19, color: 'EDE2FA',
    lineSpacing: 30, margin: 0,
  })
  s.addText('塗り終わった紙をスキャナに通すだけ。約3秒後には、\nその絵が画面の中で動いています。', {
    x: M, y: 4.68, w: 5.3, h: 0.8, fontFace: FONT, fontSize: 14, color: 'BCA8DC',
    lineSpacing: 24, margin: 0,
  })
  s.addText('通年版はすでに2会場・のべ630人のお子さまに参加いただいています。', {
    x: M, y: 5.55, w: 5.3, h: 0.4, fontFace: FONT, fontSize: 13, bold: true, color: AQUA, margin: 0,
  })
  s.addNotes('10月だけの版であること、通年版に実績があることを最初に置く。')
}

/* ------------------------------------------------- 2 なぜハロウィンなのか */
{
  const s = slide(false)
  heading(s, 'なぜハロウィンなのか', '通年の「お絵かき水族館」「お絵かきダイナソー」に、季節を乗せた10月だけの版です')

  const items = [
    ['会場の装飾と地続きになる', '10月の売場はすでにハロウィンの飾りで作られています。そこへ同じ世界観のモニターが置かれると、催事が売場から浮きません。'],
    ['仮装と相性がよい', '仮装して来た子が、自分の塗ったおばけと一緒に写真を撮れます。通年版には無い「今日ここに来た理由」が1つ増えます。'],
    ['期間が決まっているから来る理由になる', '「いつでもできる」ではなく10月だけです。告知の文言が、そのまま集客の理由になります。'],
    ['夜の画面が売場で目立つ', '水族館の青・恐竜の空に対し、ハロウィンは暗い夜空に満月です。明るい売場の中でモニターが際立ちます。'],
  ]
  items.forEach(([t, d], i) => {
    const x = M + (i % 2) * 6.06
    const y = 1.72 + Math.floor(i / 2) * 2.42
    card(s, { x, y, w: 5.76, h: 2.16 })
    s.addShape(p.ShapeType.ellipse, { x: x + 0.36, y: y + 0.36, w: 0.2, h: 0.2, fill: { color: WARM } })
    s.addText(t, {
      x: x + 0.72, y: y + 0.26, w: 4.7, h: 0.42, fontFace: FONT, fontSize: 16, bold: true,
      color: INK, valign: 'middle', margin: 0,
    })
    s.addText(d, {
      x: x + 0.36, y: y + 0.8, w: 5.04, h: 1.16, fontFace: FONT, fontSize: 13, color: MUTE,
      lineSpacing: 22, margin: 0,
    })
  })
  s.addText('おすすめは10月中旬〜31日、土日を含む日程です。11月に入ると季節物として弱くなるため、その場合は通年版をご提案します。', {
    x: M, y: 6.3, w: W - M * 2, h: 0.4, fontFace: FONT, fontSize: 12.5, color: MUTE, margin: 0,
  })
  s.addNotes('期間限定であることが弱点ではなく、来る理由になるという話。')
}

/* ------------------------------------------------- 3 実施実績 */
{
  const s = slide(false)
  heading(s, '実施実績', '通年版ですでに2会場・のべ630人のお子さまに参加いただいています')

  const venues = [
    ['イオン久御山店', '2日間', '420人'],
    ['イオン大日店', '2日間', '210人'],
  ]
  const vy = 1.9
  card(s, { x: M, y: vy, w: 5.5, h: 1.9, fill: TINT, stroke: 'DCD0EE' })
  venues.forEach(([name, days, people], i) => {
    const y = vy + 0.22 + i * 0.72
    s.addText(name, { x: M + 0.35, y, w: 2.2, h: 0.5, fontFace: FONT, fontSize: 15, bold: true, color: INK, valign: 'middle', margin: 0 })
    s.addText(days, { x: M + 2.6, y, w: 1.3, h: 0.5, fontFace: FONT, fontSize: 13, color: MUTE, valign: 'middle', margin: 0 })
    s.addText(people, { x: M + 3.9, y, w: 1.5, h: 0.5, fontFace: FONT, fontSize: 20, bold: true, color: SEA, align: 'right', valign: 'middle', margin: 0 })
  })
  s.addShape(p.ShapeType.line, { x: M + 0.35, y: vy + 1.44, w: 4.8, h: 0, line: { color: 'C9B6E4', width: 1 } })
  s.addText('合計 4日間', { x: M + 0.35, y: vy + 1.5, w: 2.85, h: 0.34, fontFace: FONT, fontSize: 13, bold: true, color: INK, valign: 'middle', margin: 0 })
  s.addText('630人', { x: M + 3.9, y: vy + 1.5, w: 1.5, h: 0.34, fontFace: FONT, fontSize: 15, bold: true, color: WARM, align: 'right', valign: 'middle', margin: 0 })

  // ここをぼかさない。実績は通年版のもので、ハロウィンはまだ実施していない
  card(s, { x: M, y: 4.0, w: 5.5, h: 2.1, fill: 'FDF1EC', stroke: 'F2CDBF' })
  s.addText('この実績は通年版でのものです。ハロウィンはまだ実施していません。', {
    x: M + 0.35, y: 4.22, w: 4.8, h: 0.72, fontFace: FONT, fontSize: 14, bold: true, color: INK, lineSpacing: 22, margin: 0,
  })
  s.addText('ただし仕組みは同じもので、変わるのは台紙と画面の世界だけです。4日間・630人を通した運用と、そこで見つかった不具合の修正は、そのままハロウィンにも効いています。', {
    x: M + 0.35, y: 4.98, w: 4.8, h: 1.0, fontFace: FONT, fontSize: 12.5, color: MUTE, lineSpacing: 20, margin: 0,
  })

  s.addImage({ path: SHOT_GALLERY, x: 6.3, y: 1.9, w: 6.3, h: 3.87, shadow: shadow() })
  s.addText('通年版で実際に会場で塗られた絵の一部（すべて実物）。ハロウィンでも同じように、塗った色のまま動きます。', {
    x: 6.3, y: 5.82, w: 6.3, h: 0.5, fontFace: FONT, fontSize: 10.5, color: MUTE, lineSpacing: 16, margin: 0,
  })
  s.addNotes('実績は通年版のもの、と口頭でも必ず添える。')
}

/* ------------------------------------------------- 4 1枚でいうと */
{
  const s = slide(false)
  heading(s, '1枚でいうと')

  s.addText([
    { text: '塗り終わった紙をスキャナに通すだけで、', options: { breakLine: true } },
    { text: '約3秒後', options: { bold: true, color: SEA } },
    { text: 'にその絵が画面の中で動き始めます。', options: { breakLine: true } },
    { text: '自分の絵を探して、指をさして、親を呼ぶ。' },
  ], { x: M, y: 1.55, w: 6.9, h: 1.5, fontFace: FONT, fontSize: 19, color: INK, lineSpacing: 34, margin: 0 })
  s.addText('この瞬間を作るための企画です。', {
    x: M, y: 3.05, w: 6.9, h: 0.52, fontFace: FONT, fontSize: 22, bold: true, color: WARM, margin: 0,
  })
  s.addText([
    { text: '塗り絵なので', options: {} },
    { text: '絵が苦手な子でも参加できます', options: { bold: true } },
    { text: '。塗った紙は持ち帰れます。', options: { breakLine: true } },
    { text: 'かぼちゃ・おばけ・こうもり・まじょ・フランケンシュタインの5種類です。', options: {} },
  ], { x: M, y: 3.78, w: 6.9, h: 0.68, fontFace: FONT, fontSize: 14, color: MUTE, lineSpacing: 22, margin: 0 })

  card(s, { x: M, y: 4.55, w: 6.9, h: 1.9, fill: TINT, stroke: 'DCD0EE' })
  s.addText([
    { text: '会場にお借りするのは「場所」だけです。', options: { bold: true, breakLine: true } },
    { text: '机・椅子・モニター・機材・画材まで、すべてこちらで持ち込みます。' },
  ], { x: M + 0.35, y: 4.62, w: 6.25, h: 0.9, fontFace: FONT, fontSize: 13.5, color: INK, lineSpacing: 23, margin: 0 })
  const facts = ['インターネット不要', '音は出ません', '個人情報なし', '跡は残りません']
  facts.forEach((t, i) => {
    const x = M + 0.35 + (i % 2) * 3.1
    const y = 5.6 + Math.floor(i / 2) * 0.44
    s.addShape(p.ShapeType.ellipse, { x, y: y + 0.08, w: 0.16, h: 0.16, fill: { color: SEA } })
    s.addText(t, { x: x + 0.28, y, w: 2.7, h: 0.32, fontFace: FONT, fontSize: 13, color: INK, valign: 'middle', margin: 0 })
  })

  s.addImage({ path: SHOT, x: 8.05, y: 1.55, w: 4.55, h: 2.44, shadow: shadow() })
  s.addText('実際の画面', { x: 8.05, y: 4.06, w: 4.55, h: 0.28, fontFace: FONT, fontSize: 10, color: MUTE, margin: 0 })
  const nums = [
    ['約3秒', '塗り終わってから動き出すまで'],
    ['50匹', '同時に動く数の上限'],
    ['5種類', '選べる台紙'],
  ]
  nums.forEach(([big, small], i) => {
    const y = 4.68 + i * 0.62
    s.addText(big, { x: 8.05, y, w: 1.5, h: 0.5, fontFace: FONT, fontSize: 22, bold: true, color: SEA, valign: 'middle', margin: 0 })
    s.addText(small, { x: 9.6, y, w: 3.0, h: 0.5, fontFace: FONT, fontSize: 12, color: MUTE, valign: 'middle', margin: 0 })
  })
  s.addNotes('会場が負担するのは場所だけ、という点を最初に伝える。')
}

/* ------------------------------------------------- 5 来場者の体験 */
{
  const s = slide(false)
  heading(s, '来場者の体験', '会場で実際に起きること')

  s.addImage({ path: SHOT_TRANSFORM, x: M, y: 1.72, w: 6.6, h: 2.31, shadow: shadow() })
  s.addText('撮影した紙（左）が、約3秒後にそのまま画面の中で動きます（右）。通年版で実際に会場で塗られた1枚です。', {
    x: M, y: 4.15, w: 6.6, h: 0.7, fontFace: FONT, fontSize: 13, color: MUTE, lineSpacing: 22, margin: 0,
  })
  s.addImage({ path: SHOT, x: M, y: 4.95, w: 6.6, h: 1.4, sizing: { type: 'cover', w: 6.6, h: 1.4 }, shadow: shadow() })

  const bx = 7.9
  s.addText([
    { text: '大きなモニターの中に、', options: {} },
    { text: '満月の出ている紫の夜空', options: { bold: true, color: SEA } },
    { text: 'が広がっています。下には枯れ木・墓石・かぼちゃ畑があり、霧が流れています。その中を、子どもたちが塗ったおばけたちがふわふわ漂っています。', options: {} },
  ], { x: bx, y: 1.72, w: 4.72, h: 1.7, fontFace: FONT, fontSize: 14.5, color: INK, lineSpacing: 26, margin: 0 })

  card(s, { x: bx, y: 3.62, w: 4.72, h: 1.75, fill: 'FDF1EC', stroke: 'F2CDBF' })
  s.addText('「あっ、わたしの！」', {
    x: bx + 0.3, y: 3.9, w: 4.1, h: 0.5, fontFace: FONT, fontSize: 23, bold: true, color: WARM, margin: 0,
  })
  s.addText('子どもは画面に駆け寄って自分の絵を指さし、親を呼びます。親はスマホを構えます。', {
    x: bx + 0.3, y: 4.48, w: 4.12, h: 0.7, fontFace: FONT, fontSize: 13, color: INK, lineSpacing: 21, margin: 0,
  })
  s.addText('この10秒のために全部を作っています。', {
    x: bx, y: 5.6, w: 4.72, h: 0.45, fontFace: FONT, fontSize: 16, bold: true, color: SEA, margin: 0,
  })
  s.addNotes('体験の核。3秒で動き出すことと、自分の絵を見つける瞬間。')
}

/* ------------------------------------------------- 6 塗れる5種 */
{
  const s = slide(false)
  heading(s, '塗れるのは5種類です', '5種とも夜空を「浮く」動きで揃えています')

  s.addImage({ path: SHOT_SHEETS, x: M, y: 1.68, w: W - M * 2, h: 2.36, shadow: shadow() })

  const kinds = [
    ['かぼちゃ', 'E8653F', '夜空をゆっくり上下に漂います'],
    ['おばけ', '9B7BD1', 'ふわふわと、いちばんゆっくり漂います'],
    ['こうもり', '5B4A86', '翼を広げて、左右へすいっと進みます'],
    ['まじょ', '2E9E7B', 'ほうきに乗って夜空を横切ります'],
    ['フランケンシュタイン', '7A3FB5', '手を広げたまま、ゆったり漂います'],
  ]
  kinds.forEach(([name, dot, desc], i) => {
    const x = M + i * 2.42
    const y = 4.3
    card(s, { x, y, w: 2.22, h: 1.62, flat: true })
    s.addShape(p.ShapeType.ellipse, { x: x + 0.22, y: y + 0.26, w: 0.2, h: 0.2, fill: { color: dot } })
    s.addText(name, {
      x: x + 0.5, y: y + 0.18, w: 1.6, h: 0.36, fontFace: FONT, fontSize: 12.5, bold: true,
      color: INK, valign: 'middle', margin: 0,
    })
    s.addText(desc, {
      x: x + 0.22, y: y + 0.62, w: 1.82, h: 0.86, fontFace: FONT, fontSize: 11, color: MUTE,
      lineSpacing: 17, margin: 0,
    })
  })
  s.addText('歩く絵と浮く絵を混ぜると、見分けを1つ間違えただけで「地面を歩くはずのものが空に浮く」事故になります。ハロウィンは題材そのものが空に合うので、混ぜない設計にしました。', {
    x: M, y: 6.12, w: W - M * 2, h: 0.5, fontFace: FONT, fontSize: 12, color: MUTE, lineSpacing: 18, margin: 0,
  })
  s.addNotes('台紙の形は、互いに見分けられることを測ってから印刷している。')
}

/* ------------------------------------------------- 7 流れ */
{
  const s = slide(false)
  heading(s, '流れ', '1人あたり 5〜10分')

  const steps = [
    ['1', '台紙を選ぶ（5種）', '30秒', '「選ぶ」という行為で、自分のものになる'],
    ['2', '好きな色で塗る', '3〜7分', '塗るだけなので失敗しない。絵が苦手でも参加できる'],
    ['3', 'スタッフに渡す → スキャン', '20秒', '待たせない。機械の操作は見せない'],
    ['4', '画面に自分の絵が現れる', '1〜3分', '「自分がやったことが、大きな画面を変えた」'],
    ['5', '塗った紙を持ち帰る', '—', '家でもう一度話題になる'],
  ]
  steps.forEach(([n, what, time, why], i) => {
    const y = 1.78 + i * 1.02
    const hot = n === '4'
    card(s, { x: M, y, w: W - M * 2, h: 0.86, fill: hot ? 'F0E8FA' : 'FFFFFF', stroke: hot ? 'C9B6E4' : LINE, flat: true })
    s.addShape(p.ShapeType.ellipse, { x: M + 0.28, y: y + 0.21, w: 0.44, h: 0.44, fill: { color: hot ? SEA : 'E2DAEE' } })
    s.addText(n, { x: M + 0.28, y: y + 0.21, w: 0.44, h: 0.44, fontFace: FONT, fontSize: 14, bold: true, color: hot ? 'FFFFFF' : MUTE, align: 'center', valign: 'middle', margin: 0 })
    s.addText(what, { x: M + 0.95, y, w: 4.2, h: 0.86, fontFace: FONT, fontSize: 16, bold: true, color: INK, valign: 'middle', margin: 0 })
    s.addText(time, { x: M + 5.2, y, w: 1.0, h: 0.86, fontFace: FONT, fontSize: 13, bold: true, color: SEA, align: 'right', valign: 'middle', margin: 0 })
    s.addText(why, { x: M + 6.5, y, w: 5.0, h: 0.86, fontFace: FONT, fontSize: 13, color: MUTE, valign: 'middle', margin: 0 })
  })
  s.addNotes('4 が体験の山。ここまで3秒で来ることが他にない点。')
}

/* ------------------------------------------------- 8 なぜこの形か */
{
  const s = slide(false)
  heading(s, 'なぜこの形にしているか')

  const items = [
    ['塗り絵にした理由', '白紙に「おばけを描いて」と言うと、描ける子と描けない子が分かれます。台紙なら全員が同じスタートラインに立てて、しかも必ずそのおばけに見えたまま動きます。'],
    ['3秒にこだわる理由', '「あとで映ります」では、自分がやったこととの因果が切れます。その場で動き出すから、驚きと達成感になります。'],
    ['怖くしない', '台紙はどれも笑っている顔です。血も牙も描いていません。画面も真っ黒にせず、紫の夜空と満月にしています。小さい子が怖がると、保護者ごと離れてしまうからです。'],
    ['絵を直さない／50匹まで', 'はみ出した色も塗り残しも、そのまま動きます。増え続けると自分の絵を見失うので、古い絵は画面の外へ去ります。絵どうしも避け合います。'],
  ]
  items.forEach(([t, d], i) => {
    const x = M + (i % 2) * 6.06
    const y = 1.72 + Math.floor(i / 2) * 2.42
    card(s, { x, y, w: 5.76, h: 2.16 })
    s.addShape(p.ShapeType.ellipse, { x: x + 0.36, y: y + 0.36, w: 0.2, h: 0.2, fill: { color: SEA } })
    s.addText(t, { x: x + 0.72, y: y + 0.26, w: 4.7, h: 0.42, fontFace: FONT, fontSize: 17, bold: true, color: INK, valign: 'middle', margin: 0 })
    s.addText(d, { x: x + 0.36, y: y + 0.8, w: 5.04, h: 1.16, fontFace: FONT, fontSize: 13, color: MUTE, lineSpacing: 22, margin: 0 })
  })
  s.addNotes('見た目の話ではなく、体験を成立させるための決めごと。')
}

/* ------------------------------------------------- 9 年齢と混雑 */
{
  const s = slide(false)
  heading(s, '年齢による楽しみ方と、混雑したとき')

  const ages = [
    ['未就学児', '塗ること自体が楽しい。画面では色で自分の絵を探します'],
    ['小学生', '顔や模様を工夫する。仮装とおそろいの色に塗る子が出ます'],
    ['保護者', '撮影する。仮装した子と、その子の絵を一緒に撮れます'],
  ]
  ages.forEach(([t, d], i) => {
    const x = M + i * 4.04
    card(s, { x, y: 1.72, w: 3.74, h: 1.72 })
    s.addText(t, { x: x + 0.34, y: 1.96, w: 3.06, h: 0.42, fontFace: FONT, fontSize: 17, bold: true, color: SEA, valign: 'middle', margin: 0 })
    s.addText(d, { x: x + 0.34, y: 2.46, w: 3.06, h: 0.86, fontFace: FONT, fontSize: 12.5, color: MUTE, lineSpacing: 20, margin: 0 })
  })

  s.addText('混雑したとき', { x: M, y: 3.95, w: 6.0, h: 0.44, fontFace: FONT, fontSize: 20, bold: true, color: INK, margin: 0 })
  const jams = [
    ['塗る席は6席', '1時間あたり 30〜50人が目安です（塗り時間5分想定）。通年版の実績はイオン久御山店で2日間420人'],
    ['列はできません', '待ち行列はスキャンの20秒だけ。塗っている人が滞留するだけで、機械の前には並びません'],
    ['持ち帰りもできます', '台紙を持ち帰り、あとから塗って戻ってきてもらうこともできます'],
  ]
  jams.forEach(([t, d], i) => {
    const y = 4.6 + i * 0.78
    s.addShape(p.ShapeType.ellipse, { x: M + 0.04, y: y + 0.14, w: 0.18, h: 0.18, fill: { color: WARM } })
    s.addText(t, { x: M + 0.42, y, w: 2.9, h: 0.46, fontFace: FONT, fontSize: 14.5, bold: true, color: INK, valign: 'middle', margin: 0 })
    s.addText(d, { x: M + 3.4, y, w: 8.4, h: 0.46, fontFace: FONT, fontSize: 13, color: MUTE, valign: 'middle', margin: 0 })
  })
  s.addNotes('回転と待ち時間の見込み。')
}

/* ------------------------------------------------- 10-11 心配ごと */
{
  const qa = [
    ['ネットワークを使いますか', '使いません。会場のWi-Fiも有線も不要です'],
    ['音は出ますか', '出しません。静かな展示です'],
    ['個人情報を集めますか', '集めません。名前も写真も年齢もいただきません。残すのは絵の画像だけです'],
    ['絵は誰かに公開されますか', 'しません。その場のモニターに映るだけで、外部には一切送りません'],
    ['怖い絵になりませんか', 'なりません。台紙は5種とも笑っている顔です。血も牙も描いていません。画面も真っ黒にせず、紫の夜空と満月にしています'],
    ['机や椅子はお借りできますか', '不要です。こちらで持ち込みます'],
    ['モニターの用意は必要ですか', '不要です。こちらで持ち込みます'],
    ['汚れませんか', '汚れにくいです。クレヨンと色鉛筆だけで、絵の具や液体は使いません。机はこちらの持ち込みで、養生シートを敷きます'],
    ['子どもが機械を触りませんか', '機材は机の奥に置き、来場者は触りません。操作するのはスタッフだけです'],
    ['コード類は危なくないですか', '固定します。床を通る線は養生テープで留めます'],
    ['途中で止まりませんか', '万一PCが止まっても、再起動すればそれまでの絵は全部残ります。塗った紙も手元に残るので、通し直せます'],
    ['大人数でも大丈夫ですか', '実績があります。通年版はイオン久御山店で2日間420人にご参加いただきました'],
    ['片付けは', '持ち込んだものを全部引き上げ、ゴミも持ち帰ります。跡は残りません'],
  ]
  const pages = [qa.slice(0, 7), qa.slice(7)]
  pages.forEach((rows, page) => {
    const s = slide(false)
    heading(s, page === 0 ? 'ご心配への回答' : 'ご心配への回答（つづき）')
    rows.forEach(([q, a], i) => {
      const y = 1.72 + i * 0.8
      s.addText(q, { x: M, y, w: 4.1, h: 0.74, fontFace: FONT, fontSize: 14, bold: true, color: INK, valign: 'middle', margin: 0 })
      const cut = a.indexOf('。')
      s.addText([
        { text: a.slice(0, cut + 1), options: { bold: true, color: INK } },
        { text: a.slice(cut + 1) },
      ], { x: M + 4.3, y, w: 7.55, h: 0.74, fontFace: FONT, fontSize: 12.5, color: MUTE, valign: 'middle', lineSpacing: 19, margin: 0 })
      s.addShape(p.ShapeType.line, { x: M, y: y + 0.76, w: W - M * 2, h: 0, line: { color: LINE, width: 1 } })
    })
    s.addNotes('会場側が判断に使う項目。')
  })
}

/* ------------------------------------------------- 12 ねらい */
{
  const s = slide(true)
  s.addText('この企画のねらい', {
    x: M, y: 1.15, w: W - M * 2, h: 0.7, fontFace: FONT, fontSize: 32, bold: true, color: 'FFFFFF', margin: 0,
  })
  const aims = [
    ['待たせない', '塗り終えてから動き出すまで約3秒。「描いて終わり」にしません'],
    ['見つけられる', '同時に動くのは最新の50匹まで。増えすぎて自分の絵を見失わないようにしています'],
    ['持ち帰れる', '紙は本人のものです。画面の中と手元の両方に残ります'],
    ['怖くない', '笑っている顔の台紙と、真っ黒にしない夜空。小さい子でも入れます'],
  ]
  aims.forEach(([t, d], i) => {
    const x = M + (i % 2) * 6.06
    const y = 2.15 + Math.floor(i / 2) * 1.62
    s.addShape(p.ShapeType.roundRect, { x, y, w: 5.76, h: 1.42, rectRadius: 0.1, fill: { color: NIGHT_CARD }, line: { color: NIGHT_LINE, width: 1 } })
    s.addText(t, { x: x + 0.36, y: y + 0.2, w: 5.0, h: 0.4, fontFace: FONT, fontSize: 18, bold: true, color: AQUA, valign: 'middle', margin: 0 })
    s.addText(d, { x: x + 0.36, y: y + 0.64, w: 5.04, h: 0.66, fontFace: FONT, fontSize: 13, color: NIGHT_TEXT, lineSpacing: 21, margin: 0 })
  })
  const lastY = 2.15 + 2 * 1.62
  s.addShape(p.ShapeType.roundRect, { x: M, y: lastY, w: 11.82, h: 1.0, rectRadius: 0.1, fill: { color: NIGHT_CARD }, line: { color: NIGHT_LINE, width: 1 } })
  s.addText('10月だけの体験', { x: M + 0.36, y: lastY + 0.14, w: 4.0, h: 0.72, fontFace: FONT, fontSize: 18, bold: true, color: AQUA, valign: 'middle', margin: 0 })
  s.addText('会場の装飾と地続きになり、仮装した子が自分の絵と一緒に写真を撮れます', {
    x: M + 4.3, y: lastY, w: 7.2, h: 1.0, fontFace: FONT, fontSize: 13, color: NIGHT_TEXT, valign: 'middle', lineSpacing: 21, margin: 0,
  })
  s.addText('お絵かきハロウィン', { x: M, y: H - 0.65, w: 6.0, h: 0.4, fontFace: FONT, fontSize: 13, color: '9E86C4', margin: 0 })
  s.addNotes('締め。4点＋期間限定であることを覚えて帰ってもらう。')
}

p.writeFile({ fileName: OUT }).then(() => console.log('wrote', OUT))
