import { describe, expect, it } from 'vitest'
import { createImage, type RgbaImage } from '../image'
import { rotateQuarter } from '../rig'
import {
  SPECIES,
  SPECIES_IDS,
  TEMPLATES,
  directionInPiece,
  identifySpecies,
  partsForPiece,
  rigForSpecies,
  templatesForTheme,
  type SpeciesId,
} from '../templates'
import { TEMPLATE_BITS, TEMPLATE_GRID } from '../templates.generated'

/** 台紙の升目から、その形の絵を作る（1升 = 4画素）。 */
function pieceOf(id: SpeciesId, scale = 4): RgbaImage {
  const bits = TEMPLATE_BITS[id as keyof typeof TEMPLATE_BITS]
  const size = TEMPLATE_GRID * scale
  const image = createImage(size, size)
  for (let row = 0; row < TEMPLATE_GRID; row++) {
    for (let column = 0; column < TEMPLATE_GRID; column++) {
      if (bits[row * TEMPLATE_GRID + column] !== '1') continue
      for (let y = row * scale; y < (row + 1) * scale; y++) {
        for (let x = column * scale; x < (column + 1) * scale; x++) {
          image.data[(y * size + x) * 4 + 3] = 255
        }
      }
    }
  }
  return image
}

function mirrored(image: RgbaImage): RgbaImage {
  const out = createImage(image.width, image.height)
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const from = (y * image.width + x) * 4
      const to = (y * image.width + (image.width - 1 - x)) * 4
      for (let k = 0; k < 4; k++) out.data[to + k] = image.data[from + k]
    }
  }
  return out
}

/** 時計回りに90度回す。 */
function turned(image: RgbaImage): RgbaImage {
  const out = createImage(image.height, image.width)
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const from = (y * image.width + x) * 4
      const to = (x * out.width + (out.width - 1 - y)) * 4
      for (let k = 0; k < 4; k++) out.data[to + k] = image.data[from + k]
    }
  }
  return out
}

/**
 * 紙を斜めに置いたときの絵。台紙をそのまま少し回す。
 *
 * 画素を落とさないよう、回した先から元の画素を引く（拡大はしない）。
 */
function tilted(image: RgbaImage, degrees: number): RgbaImage {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const side = Math.ceil((image.width + image.height) * 0.75)
  const out = createImage(side, side)
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const dx = x - side / 2
      const dy = y - side / 2
      const sx = Math.round(image.width / 2 + dx * cos + dy * sin)
      const sy = Math.round(image.height / 2 - dx * sin + dy * cos)
      if (sx < 0 || sx >= image.width || sy < 0 || sy >= image.height) continue
      const from = (sy * image.width + sx) * 4
      const to = (y * side + x) * 4
      for (let k = 0; k < 4; k++) out.data[to + k] = image.data[from + k]
    }
  }
  return out
}

describe('台紙のデータ', () => {
  it('水族館6種・恐竜5種がそろっている', () => {
    expect(TEMPLATES).toHaveLength(11)
    expect(SPECIES_IDS.sort()).toEqual([
      'ankylosaurus',
      'brontosaurus',
      'fish',
      'iruka',
      'kurage',
      'pteranodon',
      'same',
      'stegosaurus',
      'tako',
      'triceratops',
      'umigame',
    ])
  })

  /*
   * **テーマを混ぜて照合してはいけない。**
   * 11種をひとつの集まりとして測ると、まる魚とトリケラトプスが 0.69 で重なる。
   * 塗った魚が恐竜として判定されると、尾びれが見当違いの場所に付く。
   */
  it('テーマごとに台紙が分かれている', () => {
    expect(templatesForTheme('aquarium')).toHaveLength(6)
    expect(templatesForTheme('dinosaur')).toHaveLength(5)
    for (const template of templatesForTheme('dinosaur')) {
      expect(SPECIES[template.id as SpeciesId].theme).toBe('dinosaur')
    }
  })

  it('升目の数が合っている', () => {
    for (const template of TEMPLATES) {
      expect(template.shape.cells).toHaveLength(TEMPLATE_GRID * TEMPLATE_GRID)
      // 空でも真っ黒でもない
      const filled = template.shape.cells.filter(Boolean).length
      expect(filled).toBeGreaterThan(TEMPLATE_GRID * 2)
      expect(filled).toBeLessThan(TEMPLATE_GRID * TEMPLATE_GRID * 0.9)
    }
  })
})

describe('identifySpecies', () => {
  it('台紙そのものは、その台紙として見分けられる', () => {
    for (const id of SPECIES_IDS) {
      const found = identifySpecies(pieceOf(id))
      expect(found?.id).toBe(id)
      expect(found?.score).toBeGreaterThan(0.9)
    }
  })

  it('左右反転しても、回しても、同じ台紙として見分けられる', () => {
    for (const id of SPECIES_IDS) {
      expect(identifySpecies(mirrored(pieceOf(id)))?.id).toBe(id)
      expect(identifySpecies(turned(pieceOf(id)))?.id).toBe(id)
      expect(identifySpecies(turned(turned(pieceOf(id))))?.id).toBe(id)
    }
  })

  /*
   * **紙は必ず少し斜めに置かれる**（R-042）。
   * 傾きを試すようにする前は、6度でクラゲが 0.45 まで落ち、
   * しきい値（0.7）を割って「どの台紙でもない」になっていた。
   */
  it.each([-6, -3, 3, 6])('紙が %d 度傾いていても、同じ台紙として見分けられる', (degrees) => {
    for (const id of SPECIES_IDS) {
      const found = identifySpecies(tilted(pieceOf(id, 8), degrees))
      expect(found?.id).toBe(id)
    }
  })

  /*
   * **足・触手の向きは、絵から推定しない**（R-044）。
   * 波は「止める側」から「振れる側」へ強くなるので、ここが逆になると
   * 止めるべき頭が大きく振れる。実測でタコ4匹のうち2匹が逆になっていて、
   * 会場から「顔が揺れている」と言われた。
   */
  it('足のある生き物は、台紙から足の向きが決まる', () => {
    for (const id of ['tako', 'kurage', 'umigame'] as const) {
      expect(rigForSpecies(id, false).tipsDown).toBe(true)
      // 左右反転しても上下は変わらない
      expect(rigForSpecies(id, true).tipsDown).toBe(true)
    }
  })

  it('横向きに泳ぐ生き物には、足の向きを持たせない', () => {
    // 魚・イルカ・サメ・恐竜は縦に切らないので、あっても使われない。
    // 持たせると「使われるのかどうか」が読めなくなる
    for (const id of ['fish', 'iruka', 'same', 'pteranodon'] as const) {
      expect(rigForSpecies(id, false).tipsDown).toBeUndefined()
    }
  })

  it('台紙に無い形（ただの四角）は、どれにも当てはめない', () => {
    const square = createImage(80, 80)
    for (let y = 10; y < 70; y++) {
      for (let x = 10; x < 70; x++) square.data[(y * 80 + x) * 4 + 3] = 255
    }
    expect(identifySpecies(square)).toBeNull()
  })
})

describe('頭の向き', () => {
  it('台紙のままなら、台紙に書いた向きがそのまま返る', () => {
    for (const id of SPECIES_IDS) {
      expect(directionInPiece(id, 0, false)).toEqual(SPECIES[id].head)
    }
  })

  it('左右反転すると、横向きの生き物は頭が右になる', () => {
    // 台紙の魚は左を向いている
    expect(SPECIES.fish.head).toEqual({ x: -1, y: 0 })
    const found = identifySpecies(mirrored(pieceOf('fish')))
    expect(found?.headsRight).toBe(true)
    expect(found?.head.x).toBeGreaterThan(0)
  })

  it('反転していない魚は、頭が左のまま', () => {
    const found = identifySpecies(pieceOf('fish'))
    expect(found?.headsRight).toBe(false)
  })

  it('90度回すと、頭の向きも90度ついてくる', () => {
    // 左を向いた魚を時計回りに90度回すと、頭は上を向く
    const found = identifySpecies(turned(pieceOf('fish')))
    expect(found?.head.y).toBeLessThan(0)
    expect(Math.abs(found?.head.x ?? 1)).toBeLessThan(0.001)
    // 上下を向いているときは「右か左か」は答えない
    expect(found?.headsRight).toBeNull()
  })

  it('上を向いている生き物（タコ）では、左右の答えを返さない', () => {
    expect(identifySpecies(pieceOf('tako'))?.headsRight).toBeNull()
  })
})

describe('手足の分割', () => {
  /** 分割が絵を隙間なく、重なりなく覆っているか。 */
  function covers(parts: readonly { box: { x: number; y: number; w: number; h: number } }[]): {
    area: number
    overlap: number
  } {
    let area = 0
    let overlap = 0
    for (let index = 0; index < parts.length; index++) {
      const a = parts[index].box
      area += a.w * a.h
      for (let other = index + 1; other < parts.length; other++) {
        const b = parts[other].box
        const wide = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const tall = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        if (wide > 0.0001 && tall > 0.0001) overlap += wide * tall
      }
    }
    return { area, overlap }
  }

  /*
   * **分割は絵を余さず覆う必要がある。** 1か所でも抜けると、そこだけ
   * 描かれずに背景が透ける（甲羅を切ったときに実際にやった間違い）。
   * 重なりも困る。同じ画素を2度描くと、半透明の線が濃く出る。
   */
  it('分割を持つ絵は、隙間なく重なりなく覆っている', () => {
    const partitioned: SpeciesId[] = [
      'pteranodon',
      'ankylosaurus',
      'brontosaurus',
      'stegosaurus',
      'triceratops',
    ]
    for (const id of partitioned) {
      for (const turns of [0, 1, 2, 3]) {
        for (const mirrored of [false, true]) {
          const { area, overlap } = covers(partsForPiece(id, turns, mirrored))
          expect(area, `${id} turns=${turns}`).toBeCloseTo(1, 5)
          expect(overlap, `${id} turns=${turns}`).toBeCloseTo(0, 5)
        }
      }
    }
  })

  /*
   * ウミガメは分割しない（R-050）。
   *
   * 四隅のひれを回していたら、**甲羅とのあいだに青い隙間**が開いた（実機で確認）。
   * ひれの箱の内側の縁は台紙の 58% を横切っていて、甲羅を貫いている。
   * 分割を外すと `tentacled` の経路（横帯＋せん断）になり、帯は傾きでつながるので開かない。
   */
  it('ウミガメは分割しない（回すと甲羅とのあいだが開く・R-050）', () => {
    expect(partsForPiece('umigame')).toEqual([])
    for (const turns of [0, 1, 2, 3]) {
      for (const mirrored of [false, true]) {
        expect(partsForPiece('umigame', turns, mirrored)).toEqual([])
      }
    }
  })

  it('タコは分割しない（回すと足の付け根が裂ける・R-033）', () => {
    expect(partsForPiece('tako')).toEqual([])
  })

  it('分割を持たない生き物では空を返す', () => {
    expect(partsForPiece('fish')).toEqual([])
    expect(partsForPiece(undefined)).toEqual([])
  })
})

describe('台紙の向きへ起こす（R-034）', () => {
  it('回した絵は、同じ回数だけ回し戻せば台紙の向きに戻る', () => {
    for (const id of SPECIES_IDS) {
      for (const turns of [1, 2, 3]) {
        let image = pieceOf(id)
        for (let index = 0; index < turns; index++) image = turned(image)

        const found = identifySpecies(image)
        expect(found?.id).toBe(id)

        // 照合が言うとおりに回すと、もう回す必要が無くなる
        const straightened = rotateQuarter(image, found!.turns)
        const after = identifySpecies(straightened)
        expect(after?.turns).toBe(0)
      }
    }
  })

  it('上下逆さまの絵（180度＋左右反転）も、起こすと上下が戻る', () => {
    // サメが実際にこの形で保存されていた
    const upsideDown = mirrored(turned(turned(pieceOf('same'))))
    const found = identifySpecies(upsideDown)
    expect(found?.turns).toBe(2)

    const straightened = rotateQuarter(upsideDown, found!.turns)
    const after = identifySpecies(straightened)
    expect(after?.turns).toBe(0)
    // 起こしたあとは左右の違いだけが残る
    expect(after?.mirrored).toBe(true)
    expect(after?.headsRight).toBe(true)
  })
})

describe('四足の恐竜', () => {
  const walkers: SpeciesId[] = ['ankylosaurus', 'brontosaurus', 'stegosaurus', 'triceratops']

  /*
   * **回さない。** 足の組に切って振っていたときは、切り目に選んだ列が
   * どれも胴を 20〜58% 貫いていて、動かすたびに足が胴から外れて見えた（R-048）。
   * いまは腰から下を帯に分け、帯ごとに**縦へ伸び縮み**させる。
   * 伸び縮みは軸の上の画素を動かさないので、胴との境目が開きようがない。
   */
  it('どの部分も回さない', () => {
    for (const id of walkers) {
      for (const part of partsForPiece(id)) expect(part.swing).toBe(0)
    }
  })

  it('動くのは腰から下の帯と、胴の上下だけ', () => {
    for (const id of walkers) {
      const parts = partsForPiece(id)
      const body = parts[parts.length - 1]
      // 胴は絵の上から腰まで。最後に描くので腰の継ぎ目を隠せる
      expect(body.box.x).toBeCloseTo(0)
      expect(body.box.y).toBeCloseTo(0)
      expect(body.box.w).toBeCloseTo(1)
      const hip = body.box.h

      const legs = parts.slice(0, -1)
      expect(legs.length).toBeGreaterThan(4)
      for (const leg of legs) {
        // 帯は腰から下端まで
        expect(leg.box.y).toBeCloseTo(hip)
        expect(leg.box.y + leg.box.h).toBeCloseTo(1)
        // **軸は腰の線。** ここがずれると胴との境目が開く
        expect(leg.pivot.y).toBeCloseTo(hip)
        expect(leg.liftAxis ?? 'y').toBe('y')
      }
      // 胴の軸も腰の線。足と揃っていないと腰で段差になる
      expect(body.pivot.y).toBeCloseTo(hip)
    }
  })

  /*
   * 隣り合う帯の伸び率の差が、そのまま足元の段差になる。
   * **一番差が大きいのは伸び率が 0 を横切る所**なので、そこを
   * 足と足の隙間（どの台紙も x=0.40 あたり）に合わせてある。
   */
  it('隣り合う帯の伸び率の差が小さい（段差にならない）', () => {
    for (const id of walkers) {
      const parts = partsForPiece(id)
      const legs = parts.slice(0, -1)
      const body = parts[parts.length - 1]
      const legHeight = 1 - body.box.h
      for (let index = 1; index < legs.length; index++) {
        const step = Math.abs((legs[index].lift ?? 0) - (legs[index - 1].lift ?? 0)) * legHeight
        // 上限は `tools/check-parts.py` の 3%
        expect(step).toBeLessThan(0.03)
      }
    }
  })

  it('前と後ろが逆に伸び縮みする（体重が移って見える）', () => {
    for (const id of walkers) {
      const legs = partsForPiece(id).slice(0, -1)
      const lifts = legs.map((leg) => leg.lift ?? 0)
      expect(Math.min(...lifts)).toBeLessThan(0)
      expect(Math.max(...lifts)).toBeGreaterThan(0)
    }
  })

  it('紙を回して置いても、回す部分は出てこない', () => {
    for (const id of walkers) {
      for (const turns of [0, 1, 2, 3]) {
        for (const mirrored of [false, true]) {
          // 反転すると `-0` になる。値としては同じ
          for (const part of partsForPiece(id, turns, mirrored)) expect(part.swing).toBeCloseTo(0)
        }
      }
    }
  })
})

describe('プテラノドンの翼', () => {
  /*
   * 翼は**回さずに伸び縮みさせる**。回すと切り目の両側がずれて裂けるため（R-037）。
   * 伸び縮みなら切り目の上が動かないので、どれだけ動かしても開かない。
   */
  it('回さずに伸び縮みする', () => {
    const parts = partsForPiece('pteranodon')
    expect(parts).toHaveLength(2)
    for (const part of parts) expect(part.swing).toBe(0)
    const moving = parts.filter((part) => (part.lift ?? 0) !== 0)
    expect(moving).toHaveLength(1)
    expect(moving[0].lift).toBeGreaterThan(0.1)
  })

  it('絵の全面を覆う', () => {
    const parts = partsForPiece('pteranodon')
    for (let row = 0; row < 48; row++) {
      for (let column = 0; column < 48; column++) {
        const x = (column + 0.5) / 48
        const y = (row + 0.5) / 48
        const covered = parts.some(
          (part) =>
            x >= part.box.x &&
            x < part.box.x + part.box.w &&
            y >= part.box.y &&
            y < part.box.y + part.box.h,
        )
        expect(covered, `(${x.toFixed(2)}, ${y.toFixed(2)}) が抜けている`).toBe(true)
      }
    }
  })

  /*
   * 動く帯の軸は、動かない帯との**境目**に置く。
   * ここがずれると、伸び縮みしたときに境目が開く。
   */
  it('伸び縮みの軸が、上下の境目にある', () => {
    const [wing, body] = partsForPiece('pteranodon')
    expect(wing.pivot.y).toBeCloseTo(wing.box.y + wing.box.h)
    expect(wing.pivot.y).toBeCloseTo(body.box.y)
  })

  it('紙を90度まわして置くと、伸び縮みの向きも変わる', () => {
    const upright = partsForPiece('pteranodon', 0, false).find((part) => part.lift)
    const turned = partsForPiece('pteranodon', 1, false).find((part) => part.lift)
    expect(upright?.liftAxis ?? 'y').toBe('y')
    expect(turned?.liftAxis).toBe('x')
  })
})
