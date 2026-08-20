// お絵かき水族館 企画書（会場へ渡す用）
const pptx = require('pptxgenjs')
const path = require('path')

const ROOT = '/home/user/PaintingsAquarium'
const SHOT = path.join(ROOT, 'docs/images/画面.jpg')
const OUT = path.join(ROOT, 'docs/お絵かき水族館-企画書.pptx')

// 水槽の画面そのものから採った色。海の濃紺を主役に、明るい水色を差し色にする
const DEEP = '062A3D'
const SEA = '0B6FA4'
const AQUA = '4FC3E8'
const INK = '15242F'
const MUTE = '5C6E7A'
const LINE = 'D8E3EA'
const TINT = 'EFF6FA'
const WARM = 'E08A2E'

const FONT = 'Meiryo'
const W = 13.333
const H = 7.5
const M = 0.72

const p = new pptx()
p.layout = 'LAYOUT_WIDE'
p.author = 'お絵かき水族館'
p.title = 'お絵かき水族館 企画書'

const shadow = () => ({ type: 'outer', color: '0B3B52', opacity: 0.12, blur: 10, offset: 2, angle: 90 })

function slide(dark) {
  const s = p.addSlide()
  s.background = { color: dark ? DEEP : 'FFFFFF' }
  return s
}

// 見出しは全スライド同じ位置。飾り線は使わず、余白と字の大きさだけで差をつける
function heading(s, text, note) {
  s.addText(text, {
    x: M, y: 0.5, w: W - M * 2, h: 0.62, fontFace: FONT, fontSize: 32, bold: true,
    color: INK, align: 'left', valign: 'middle', margin: 0,
  })
  if (note) {
    s.addText(note, {
      x: M, y: 1.16, w: W - M * 2, h: 0.36, fontFace: FONT, fontSize: 14,
      color: MUTE, valign: 'middle', margin: 0,
    })
  }
}

function card(s, o) {
  s.addShape(p.ShapeType.roundRect, {
    x: o.x, y: o.y, w: o.w, h: o.h, rectRadius: 0.1,
    fill: { color: o.fill || TINT }, line: { color: o.stroke || LINE, width: 1 },
    shadow: o.flat ? undefined : shadow(),
  })
}

/* ------------------------------------------------------------------ 1 表紙 */
{
  const s = slide(true)
  // 写真に半透明の帯を重ねると境目が段になって見えたので、左は無地・右は写真で割る
  s.addImage({ path: SHOT, x: 6.4, y: 0, w: W - 6.4, h: H, sizing: { type: 'cover', w: W - 6.4, h: H } })

  s.addText('出張ワークショップのご提案', {
    x: M, y: 1.75, w: 6.2, h: 0.36, fontFace: FONT, fontSize: 14, bold: true,
    color: AQUA, charSpacing: 2, margin: 0,
  })
  s.addText('お絵かき水族館', {
    x: M, y: 2.25, w: 6.6, h: 1.15, fontFace: FONT, fontSize: 54, bold: true,
    color: 'FFFFFF', margin: 0,
  })
  s.addText('子どもが塗った魚が、その場で\n大画面の海を泳ぎ出します。', {
    x: M, y: 3.5, w: 5.3, h: 0.9, fontFace: FONT, fontSize: 19, color: 'E4F1F8',
    lineSpacing: 30, margin: 0,
  })
  s.addText('塗り終わった紙をスキャナに通すだけ。約3秒後には、\nその絵が水槽を泳いでいます。', {
    x: M, y: 4.6, w: 5.3, h: 0.8, fontFace: FONT, fontSize: 14, color: 'A9C9DA',
    lineSpacing: 24, margin: 0,
  })
  s.addText('右は実際の画面です。泳いでいるのは、すべて塗り絵から作った絵です。', {
    x: M, y: H - 0.85, w: 5.3, h: 0.5, fontFace: FONT, fontSize: 10.5,
    color: '8FB4C8', lineSpacing: 17, margin: 0,
  })
  s.addNotes('塗り絵を大画面の水槽で泳がせる出張ワークショップの提案。')
}

/* ------------------------------------------------- 2 1枚でいうと */
{
  const s = slide(false)
  heading(s, '1枚でいうと')

  s.addText([
    { text: '塗り終わった紙をスキャナに通すだけで、', options: { breakLine: true } },
    { text: '約3秒後', options: { bold: true, color: SEA } },
    { text: 'にその絵が水槽の中を泳ぎ始めます。', options: { breakLine: true } },
    { text: '自分の絵を探して、指をさして、親を呼ぶ。' },
  ], {
    x: M, y: 1.55, w: 6.9, h: 1.5, fontFace: FONT, fontSize: 19, color: INK,
    lineSpacing: 34, margin: 0,
  })
  s.addText('この瞬間を作るための企画です。', {
    x: M, y: 3.05, w: 6.9, h: 0.52, fontFace: FONT, fontSize: 22, bold: true, color: WARM, margin: 0,
  })
  s.addText([
    { text: '塗り絵なので', options: {} },
    { text: '絵が苦手な子でも参加できます', options: { bold: true } },
    { text: '。塗った紙は持ち帰れます。', options: {} },
  ], {
    x: M, y: 3.8, w: 6.9, h: 0.4, fontFace: FONT, fontSize: 15, color: MUTE, margin: 0,
  })

  card(s, { x: M, y: 4.4, w: 6.9, h: 2.05, fill: TINT, stroke: 'CFE2EE' })
  s.addText([
    { text: '会場にお借りするのは「場所」だけです。', options: { bold: true, breakLine: true } },
    { text: '机・椅子・モニター・機材・画材まで、すべてこちらで持ち込みます。' },
  ], {
    x: M + 0.35, y: 4.62, w: 6.25, h: 0.9, fontFace: FONT, fontSize: 13.5, color: INK,
    lineSpacing: 23, margin: 0,
  })
  const facts = ['インターネット不要', '音は出ません', '個人情報なし', '跡は残りません']
  facts.forEach((t, i) => {
    const x = M + 0.35 + (i % 2) * 3.1
    const y = 5.6 + Math.floor(i / 2) * 0.44
    s.addShape(p.ShapeType.ellipse, { x, y: y + 0.08, w: 0.16, h: 0.16, fill: { color: SEA } })
    s.addText(t, { x: x + 0.28, y, w: 2.7, h: 0.32, fontFace: FONT, fontSize: 13, color: INK, valign: 'middle', margin: 0 })
  })

  s.addImage({ path: SHOT, x: 8.05, y: 1.55, w: 4.55, h: 2.56, rounding: false, shadow: shadow() })
  s.addText('実際の画面', {
    x: 8.05, y: 4.18, w: 4.55, h: 0.28, fontFace: FONT, fontSize: 10, color: MUTE, margin: 0,
  })
  const nums = [
    ['約3秒', '塗り終わってから泳ぎ出すまで'],
    ['50匹', '同時に泳ぐ数の上限'],
    ['6種類', '選べる台紙'],
  ]
  nums.forEach(([big, small], i) => {
    const y = 4.68 + i * 0.62
    s.addText(big, { x: 8.05, y, w: 1.5, h: 0.5, fontFace: FONT, fontSize: 22, bold: true, color: SEA, valign: 'middle', margin: 0 })
    s.addText(small, { x: 9.6, y, w: 3.0, h: 0.5, fontFace: FONT, fontSize: 12, color: MUTE, valign: 'middle', margin: 0 })
  })
  s.addNotes('会場が負担するのは場所だけ、という点を最初に伝える。')
}

/* ------------------------------------------------- 3 何が起きるか */
{
  const s = slide(false)
  heading(s, '来場者の体験', '会場で実際に起きること')

  s.addImage({ path: SHOT, x: M, y: 1.72, w: 6.6, h: 3.71, shadow: shadow() })
  s.addText('大きなモニターの中に青い海が広がり、子どもたちが塗った絵が泳いでいます。1匹ずつ、みんな違う色です。', {
    x: M, y: 5.6, w: 6.6, h: 0.7, fontFace: FONT, fontSize: 13, color: MUTE, lineSpacing: 22, margin: 0,
  })

  const bx = 7.9
  s.addText([
    { text: '子どもは机で台紙を塗り、塗り終わったらスタッフに渡します。スタッフが紙をスキャナに通すと、', options: {} },
    { text: '約3秒後', options: { bold: true, color: SEA } },
    { text: '、いま塗ったばかりの絵が画面の奥からふわっと現れて、泳ぎ始めます。', options: {} },
  ], {
    x: bx, y: 1.72, w: 4.72, h: 1.7, fontFace: FONT, fontSize: 15, color: INK, lineSpacing: 27, margin: 0,
  })

  card(s, { x: bx, y: 3.62, w: 4.72, h: 1.75, fill: 'FDF3E5', stroke: 'F0DCC0' })
  s.addText('「あっ、わたしの！」', {
    x: bx + 0.3, y: 3.9, w: 4.1, h: 0.5, fontFace: FONT, fontSize: 23, bold: true, color: WARM, margin: 0,
  })
  s.addText('子どもは画面に駆け寄って自分の絵を指さし、親を呼びます。親はスマホを構えます。', {
    x: bx + 0.3, y: 4.48, w: 4.12, h: 0.7, fontFace: FONT, fontSize: 13, color: INK, lineSpacing: 21, margin: 0,
  })

  s.addText('この10秒のために全部を作っています。', {
    x: bx, y: 5.6, w: 4.72, h: 0.45, fontFace: FONT, fontSize: 16, bold: true, color: SEA, margin: 0,
  })
  s.addNotes('体験の核。3秒で泳ぎ出すことと、自分の絵を見つける瞬間。');
}

/* ------------------------------------------------- 4 流れ */
{
  const s = slide(false)
  heading(s, '流れ', '1人あたり 5〜10分')

  const steps = [
    ['1', '6種類の台紙から1枚選ぶ', '30秒', '「選ぶ」という行為で、自分のものになる'],
    ['2', '好きな色で塗る', '3〜7分', '塗るだけなので失敗しない。絵が苦手でも参加できる'],
    ['3', 'スタッフに渡す → スキャン', '20秒', '待たせない。機械の操作は見せない'],
    ['4', '画面に自分の絵が現れる', '1〜3分', '「自分がやったことが、大きな画面を変えた」'],
    ['5', '塗った紙を持ち帰る', '—', '家でもう一度話題になる'],
  ]
  steps.forEach(([n, what, time, why], i) => {
    const y = 1.78 + i * 1.02
    const hot = n === '4'
    card(s, { x: M, y, w: W - M * 2, h: 0.86, fill: hot ? 'E8F3F9' : 'FFFFFF', stroke: hot ? 'B6D9EB' : LINE, flat: true })
    s.addShape(p.ShapeType.ellipse, { x: M + 0.28, y: y + 0.21, w: 0.44, h: 0.44, fill: { color: hot ? SEA : 'DCE8EF' } })
    s.addText(n, {
      x: M + 0.28, y: y + 0.21, w: 0.44, h: 0.44, fontFace: FONT, fontSize: 14, bold: true,
      color: hot ? 'FFFFFF' : MUTE, align: 'center', valign: 'middle', margin: 0,
    })
    s.addText(what, {
      x: M + 0.95, y, w: 4.2, h: 0.86, fontFace: FONT, fontSize: 16, bold: true, color: INK,
      valign: 'middle', margin: 0,
    })
    s.addText(time, {
      x: M + 5.2, y, w: 1.0, h: 0.86, fontFace: FONT, fontSize: 13, bold: true, color: SEA,
      align: 'right', valign: 'middle', margin: 0,
    })
    s.addText(why, {
      x: M + 6.5, y, w: 5.0, h: 0.86, fontFace: FONT, fontSize: 13, color: MUTE,
      valign: 'middle', margin: 0,
    })
  })
  s.addNotes('4 が体験の山。ここまで3秒で来ることが他にない点。')
}

/* ------------------------------------------------- 5 なぜこの形か */
{
  const s = slide(false)
  heading(s, 'なぜこの形にしているか')

  const items = [
    ['塗り絵にした理由', '白紙に「魚を描いて」と言うと、描ける子と描けない子が分かれます。台紙なら全員が同じスタートラインに立てて、しかも必ず魚に見えるまま泳ぎます。'],
    ['3秒にこだわる理由', '「あとで映ります」では、自分がやったこととの因果が切れます。その場で泳ぎ出すから、驚きと達成感になります。'],
    ['絵を直さない', 'はみ出した色も塗り残しも、そのまま泳ぎます。きれいに直すと「自分の絵」ではなくなります。'],
    ['同時に泳ぐのは50匹まで', '増え続けると自分の絵を見失います。古い絵は消えるのではなく、画面の外へ泳いで去ります。絵どうしも避け合います。'],
  ]
  items.forEach(([t, d], i) => {
    const x = M + (i % 2) * 6.06
    const y = 1.72 + Math.floor(i / 2) * 2.42
    card(s, { x, y, w: 5.76, h: 2.16 })
    s.addShape(p.ShapeType.ellipse, { x: x + 0.36, y: y + 0.36, w: 0.2, h: 0.2, fill: { color: SEA } })
    s.addText(t, {
      x: x + 0.72, y: y + 0.26, w: 4.7, h: 0.42, fontFace: FONT, fontSize: 17, bold: true,
      color: INK, valign: 'middle', margin: 0,
    })
    s.addText(d, {
      x: x + 0.36, y: y + 0.8, w: 5.04, h: 1.16, fontFace: FONT, fontSize: 13, color: MUTE,
      lineSpacing: 22, margin: 0,
    })
  })
  s.addNotes('見た目の話ではなく、体験を成立させるための決めごと。')
}

/* ------------------------------------------------- 6 6種類 */
{
  const s = slide(false)
  heading(s, '6種類、泳ぎ方が違います', '同じ海に6種類がいて、動きで見分けられます。自分が塗ったのがどれか、すぐ分かります。')

  const kinds = [
    ['魚', 'FF6B4A', '尾びれを振りながら進み、画面の端で向きを変えて戻ってきます'],
    ['イルカ', '3AA9E0', 'すいすい泳ぎ、ときどき水面へ大きく跳ねます'],
    ['サメ', '5F7480', '魚を見つけると急に速くなって追いかけます（追いつきません）'],
    ['タコ', 'F2A03D', '足を波打たせながら、ゆっくり上下に漂います'],
    ['クラゲ', '9B7BD1', 'ほとんど進まず、その場でふわふわしています'],
    ['ウミガメ', '2E9E7B', '前足と後ろ足を漕ぎながら、S字を描いて進みます'],
  ]
  kinds.forEach(([name, dot, desc], i) => {
    const x = M + (i % 3) * 4.04
    const y = 1.95 + Math.floor(i / 3) * 2.06
    card(s, { x, y, w: 3.74, h: 1.8 })
    s.addShape(p.ShapeType.ellipse, { x: x + 0.34, y: y + 0.36, w: 0.26, h: 0.26, fill: { color: dot } })
    s.addText(name, {
      x: x + 0.72, y: y + 0.28, w: 2.6, h: 0.42, fontFace: FONT, fontSize: 18, bold: true,
      color: INK, valign: 'middle', margin: 0,
    })
    s.addText(desc, {
      x: x + 0.34, y: y + 0.82, w: 3.06, h: 0.86, fontFace: FONT, fontSize: 12.5, color: MUTE,
      lineSpacing: 20, margin: 0,
    })
  })
  s.addText('サメが魚に追いつかないのは意図的です。「食べられた」に見えると、その絵を描いた子が悲しむからです。', {
    x: M, y: 6.2, w: W - M * 2, h: 0.4, fontFace: FONT, fontSize: 12.5, color: MUTE, margin: 0,
  })
  s.addNotes('動きで見分けられることが、自分の絵を見つけやすさに効いている。')
}

/* ------------------------------------------------- 7 年齢と混雑 */
{
  const s = slide(false)
  heading(s, '年齢による楽しみ方と、混雑したとき')

  const ages = [
    ['未就学児', '塗ること自体が楽しい。画面では色で自分の絵を探します'],
    ['小学生', '色の塗り分けや模様で工夫する。動きの違いに気づいて見比べます'],
    ['保護者', '撮影する。子どもが自分の絵を見つける瞬間を記録できます'],
  ]
  ages.forEach(([t, d], i) => {
    const x = M + i * 4.04
    card(s, { x, y: 1.72, w: 3.74, h: 1.72 })
    s.addText(t, {
      x: x + 0.34, y: 1.96, w: 3.06, h: 0.42, fontFace: FONT, fontSize: 17, bold: true, color: SEA,
      valign: 'middle', margin: 0,
    })
    s.addText(d, {
      x: x + 0.34, y: 2.46, w: 3.06, h: 0.86, fontFace: FONT, fontSize: 12.5, color: MUTE,
      lineSpacing: 20, margin: 0,
    })
  })

  s.addText('混雑したとき', {
    x: M, y: 3.95, w: 6.0, h: 0.44, fontFace: FONT, fontSize: 20, bold: true, color: INK, margin: 0,
  })
  const jams = [
    ['塗る席は6席', '1時間あたり 30〜50人が目安です（塗り時間5分想定）'],
    ['列はできません', '待ち行列はスキャンの20秒だけ。塗っている人が滞留するだけで、機械の前には並びません'],
    ['持ち帰りもできます', '台紙を持ち帰り、あとから塗って戻ってきてもらうこともできます'],
  ]
  jams.forEach(([t, d], i) => {
    const y = 4.6 + i * 0.78
    s.addShape(p.ShapeType.ellipse, { x: M + 0.04, y: y + 0.14, w: 0.18, h: 0.18, fill: { color: AQUA } })
    s.addText(t, {
      x: M + 0.42, y, w: 2.9, h: 0.46, fontFace: FONT, fontSize: 14.5, bold: true, color: INK,
      valign: 'middle', margin: 0,
    })
    s.addText(d, {
      x: M + 3.4, y, w: 8.4, h: 0.46, fontFace: FONT, fontSize: 13, color: MUTE, valign: 'middle', margin: 0,
    })
  })
  s.addNotes('回転と待ち時間の見込み。')
}

/* ------------------------------------------------- 8-9 心配ごと */
{
  const qa = [
    ['ネットワークを使いますか', '使いません。会場のWi-Fiも有線も不要です'],
    ['音は出ますか', '出しません。静かな展示です'],
    ['個人情報を集めますか', '集めません。名前も写真も年齢もいただきません。残すのは絵の画像だけです'],
    ['絵は誰かに公開されますか', 'しません。その場のモニターに映るだけで、外部には一切送りません'],
    ['机や椅子はお借りできますか', '不要です。こちらで持ち込みます'],
    ['モニターの用意は必要ですか', '不要です。こちらで持ち込みます'],
    ['汚れませんか', '汚れにくいです。クレヨンと色鉛筆だけで、絵の具や液体は使いません。机はこちらの持ち込みで、養生シートを敷きます'],
    ['子どもが機械を触りませんか', '機材は机の奥に置き、来場者は触りません。操作するのはスタッフだけです'],
    ['コード類は危なくないですか', '固定します。床を通る線は養生テープで留めます'],
    ['途中で止まりませんか', '万一PCが止まっても、再起動すればそれまでの絵は全部残ります。塗った紙も手元に残るので、通し直せます'],
    ['片付けは', '持ち込んだものを全部引き上げ、ゴミも持ち帰ります。跡は残りません'],
  ]
  const pages = [qa.slice(0, 6), qa.slice(6)]
  pages.forEach((rows, page) => {
    const s = slide(false)
    heading(s, page === 0 ? 'ご心配への回答' : 'ご心配への回答（つづき）')
    rows.forEach(([q, a], i) => {
      const y = 1.72 + i * 0.94
      s.addText(q, {
        x: M, y, w: 4.1, h: 0.86, fontFace: FONT, fontSize: 14, bold: true, color: INK,
        valign: 'middle', margin: 0,
      })
      const cut = a.indexOf('。')
      s.addText([
        { text: a.slice(0, cut + 1), options: { bold: true, color: INK } },
        { text: a.slice(cut + 1) },
      ], {
        x: M + 4.3, y, w: 7.55, h: 0.86, fontFace: FONT, fontSize: 13, color: MUTE,
        valign: 'middle', lineSpacing: 20, margin: 0,
      })
      s.addShape(p.ShapeType.line, {
        x: M, y: y + 0.88, w: W - M * 2, h: 0, line: { color: LINE, width: 1 },
      })
    })
    s.addNotes('会場側が判断に使う項目。')
  })
}

/* ------------------------------------------------- 10 ねらい */
{
  const s = slide(true)
  s.addText('この企画のねらい', {
    x: M, y: 1.15, w: W - M * 2, h: 0.7, fontFace: FONT, fontSize: 32, bold: true, color: 'FFFFFF', margin: 0,
  })
  const aims = [
    ['待たせない', '塗り終えてから泳ぎ出すまで約3秒。「描いて終わり」にしません'],
    ['見つけられる', '同時に泳ぐのは最新の50匹まで。増えすぎて自分の絵を見失わないようにしています'],
    ['持ち帰れる', '紙は本人のものです。画面の中と手元の両方に残ります'],
    ['繰り返せる', '1人が2枚描いても仕組みは変わりません'],
  ]
  aims.forEach(([t, d], i) => {
    const x = M + (i % 2) * 6.06
    const y = 2.35 + Math.floor(i / 2) * 1.9
    s.addShape(p.ShapeType.roundRect, {
      x, y, w: 5.76, h: 1.62, rectRadius: 0.1,
      fill: { color: '0E3C56' }, line: { color: '1B5878', width: 1 },
    })
    s.addText(t, {
      x: x + 0.36, y: y + 0.24, w: 5.0, h: 0.44, fontFace: FONT, fontSize: 18, bold: true,
      color: AQUA, valign: 'middle', margin: 0,
    })
    s.addText(d, {
      x: x + 0.36, y: y + 0.74, w: 5.04, h: 0.7, fontFace: FONT, fontSize: 13, color: 'C3DCE9',
      lineSpacing: 21, margin: 0,
    })
  })
  s.addText('お絵かき水族館', {
    x: M, y: H - 0.95, w: 6.0, h: 0.4, fontFace: FONT, fontSize: 13, color: '7FA9BF', margin: 0,
  })
  s.addNotes('締め。4点だけ覚えて帰ってもらう。')
}

p.writeFile({ fileName: OUT }).then(() => console.log('wrote', OUT))
