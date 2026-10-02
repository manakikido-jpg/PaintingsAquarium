// 企画書スライドの共通部分（配色の表と、全スライドで使う部品）。
//
// **見た目を2つ別々に育てると必ずずれる。**
// 通年版（水族館・恐竜）とハロウィン版で、見出しの位置・カードの角丸・影の付き方は
// 同じものを使う。違うのは**配色と中身だけ**なので、ここに部品を1つだけ置いて
// 両方から読む。片方だけ直して並べたときに揃わない、という事故を防ぐため。
//
// 使い方:
//   const PALETTE = { ... }
//   const { FONT, W, H, M, shadow, slide, heading, card } = require('./proposal-deck')(p, PALETTE)

const FONT = 'Meiryo'
const W = 13.333
const H = 7.5
const M = 0.72

module.exports = function deck(p, palette) {
  const { DEEP, INK, MUTE, LINE, TINT, SHADOW } = palette

  const shadow = () => ({
    type: 'outer', color: SHADOW, opacity: 0.12, blur: 10, offset: 2, angle: 90,
  })

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

  return { FONT, W, H, M, shadow, slide, heading, card }
}
