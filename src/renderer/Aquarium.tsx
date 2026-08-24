import { useEffect, useRef } from 'react'
import type { Tank } from '../core/swim'
import {
  creatureLane,
  isCreatureOutside,
  placeCreature,
  sendCreatureOut,
  spawnCreature,
  stepCreatures,
  type Creature,
} from '../core/motion'
import { appearAlpha, appearProgress, appearScale, isNewlyArrived } from '../core/appear'
import {
  DEFAULT_UNDULATE as UNDULATE,
  beatPhase,
  beatRate,
  headRatioToImageX,
  finAngle,
  stripCount,
  stripOffset,
  tailAngle,
} from '../core/undulate'
import { headIsKnown, rigIsUsable, type CreatureKind } from '../core/rig'
import { partsForPiece, speciesFlies } from '../core/templates'
import { GLIDE_SPEED, glideTilt } from '../core/behaviour'

/**
 * 手足を漕ぐ速さ（ラジアン/秒）。
 * 速いと機械的に見え、遅いと止まって見える。1周 2 秒弱になる値にした。
 */
const LIMB_SPEED = 3.4
import type { ThemeId } from '../core/theme'
import { createScene } from './scene'
import type { Scene } from './scene/types'
import type { Piece } from '../shared/types'

interface Swimmer {
  readonly piece: Piece
  readonly element: HTMLImageElement
  /** 水槽に入った時刻（描画ループの経過秒）。演出をしない絵は -Infinity */
  readonly bornAt: number
  /** しなりの拍。絵ごとにずらさないと、群れが1枚の布のように揃って見える */
  readonly beat: { readonly rate: number; readonly phase: number }
  /** 画面の外へ去ることが決まった時刻。まだ残る絵は null */
  leavingAt: number | null
  creature: Creature
}

/** 絵の id から動き方の種を作る。同じ絵はいつ起動しても同じ動きになる。 */
function seedOf(id: string): number {
  let seed = 0
  for (const character of id) seed = (seed * 31 + character.charCodeAt(0)) | 0
  return seed
}

export function Aquarium({
  pieces,
  theme,
  sceneryStrength,
  decorDensity,
  swayStrength,
  sizeScale,
}: {
  pieces: Piece[]
  theme: ThemeId
  sceneryStrength: number
  decorDensity: number
  swayStrength: number
  sizeScale: number
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const swimmersRef = useRef<Map<string, Swimmer>>(new Map())
  // 描画ループから読むだけの値。state にすると毎フレーム再購読になる。
  const piecesRef = useRef<Piece[]>(pieces)
  piecesRef.current = pieces
  const strengthRef = useRef(sceneryStrength)
  strengthRef.current = sceneryStrength
  const themeRef = useRef(theme)
  themeRef.current = theme
  const densityRef = useRef(decorDensity)
  densityRef.current = decorDensity
  const swayRef = useRef(swayStrength)
  swayRef.current = swayStrength
  const sizeRef = useRef(sizeScale)
  sizeRef.current = sizeScale

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    let animationId = 0
    let previous = performance.now()
    let elapsed = 0
    // 起動時刻。これより後に取り込まれた絵だけを新入りとして演出する。
    const appStartedAt = Date.now()

    /*
     * 速度の実測用。既定では動かない。
     * 開発中に `?measure` を付けて開いたときだけ、実際の fps を画面の隅に出す。
     * canvas の描画命令は非同期に処理されるので、JS の経過時間を測っても 0ms に
     * しかならず、なめらかさは分からない（R-012 の切り分けで判明）。
     */
    const measure =
      typeof window !== 'undefined' && window.location.search.includes('measure')
        ? { frames: 0, total: 0, last: 0 }
        : null

    let scene: Scene | null = null
    let builtFor = { width: -1, height: -1, theme: '', density: -1, size: -1 }

    const resize = (): void => {
      // 4K の大画面でぼやけないように、実画素に合わせる。
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(canvas.clientWidth * ratio)
      canvas.height = Math.round(canvas.clientHeight * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    /**
     * 世界は画面の大きさかテーマが変わったときだけ作り直す。
     * 毎フレーム作ると、泡や煙が進まず場所だけ変わってちらつく。
     * テーマが変わったら、動き方も変わるので絵も置き直す。
     */
    const rebuild = (tank: Tank, theme: ThemeId, density: number, size: number): boolean => {
      if (
        builtFor.width === tank.width &&
        builtFor.height === tank.height &&
        builtFor.theme === theme &&
        builtFor.density === density &&
        builtFor.size === size
      ) {
        return false
      }
      // 大きさを変えたら絵を置き直す。泳ぐ範囲が絵の大きさで決まるので、
      // 大きくしただけだと画面の外に出たままの絵が残る。
      builtFor = { width: tank.width, height: tank.height, theme, density, size }
      scene = createScene(theme, tank, density)
      swimmersRef.current.clear()
      return true
    }

    const frame = (now: number): void => {
      // タブが隠れていた等で dt が跳ねると、絵が一気に壁まで飛ぶ。上限を掛ける。
      const dt = Math.min(0.05, (now - previous) / 1000)
      previous = now
      elapsed += dt

      const tank: Tank = { width: canvas.clientWidth, height: canvas.clientHeight }
      const strength = strengthRef.current
      rebuild(tank, themeRef.current, densityRef.current, sizeRef.current)
      if (!scene) {
        animationId = requestAnimationFrame(frame)
        return
      }

      const swimmers = swimmersRef.current
      const wanted = new Set(piecesRef.current.map((piece) => piece.id))
      for (const [id, swimmer] of swimmers) {
        if (wanted.has(id)) continue
        /*
         * すぐには消さない。**画面の外へ泳いで行かせる**。
         * その場で消すと、来場者から見て絵が突然消えたようにしか見えない。
         * 1日200枚・同時50匹なら会期中に150回起きる。
         */
        if (swimmer.leavingAt === null) {
          swimmer.leavingAt = elapsed
          swimmer.creature = sendCreatureOut(swimmer.creature, tank)
        }
        // 画面の外に出たら取り除く。出られないまま長く残る場合の保険も付ける
        if (isCreatureOutside(swimmer.creature, tank) || elapsed - swimmer.leavingAt > 20) {
          swimmers.delete(id)
        }
      }

      for (const piece of piecesRef.current) {
        if (swimmers.has(piece.id)) continue
        const element = new Image()
        element.src = `aqua://piece/${piece.id}`
        swimmers.set(piece.id, {
          piece,
          element,
          // 起動前からある絵は演出しない。起動のたびに全部が一斉に現れると
          // 不具合に見えるため。
          bornAt: isNewlyArrived(piece.createdAt, appStartedAt) ? elapsed : -Infinity,
          leavingAt: null,
          beat: { rate: beatRate(seedOf(piece.id)), phase: beatPhase(seedOf(piece.id)) },
          creature: spawnCreature(
            scene.motion,
            seedOf(piece.id),
            tank,
            piece.width,
            piece.height,
            scene.lanes,
            sizeRef.current,
            piece.rig?.kind ?? 'unknown',
            piece.species,
            // 飛ぶ絵は地平線（一番奥の列の地面）より上だけを使う
            scene.lanes[0]?.groundY,
          ),
        })
      }

      const list = [...swimmers.values()]
      const stepped = stepCreatures(
        list.map((swimmer) => swimmer.creature),
        dt,
        tank,
        scene.lanes[0]?.groundY,
      )
      for (let index = 0; index < list.length; index++) list[index].creature = stepped[index]

      const drawSwimmer = (swimmer: Swimmer): void => {
        if (!swimmer.element.complete || swimmer.element.naturalWidth === 0) return
        if (!scene) return

        const place = placeCreature(swimmer.creature, scene.lanes)
        const progress = appearProgress(elapsed - swimmer.bornAt)
        const scale = appearScale(progress)

        context.globalAlpha = appearAlpha(progress)
        /*
         * 足元の影は**地面に立っている絵にだけ**付ける。
         * 飛んでいる絵に付けると、空の途中に影が浮く（実機で確認）。
         */
        if (!speciesFlies(swimmer.piece.species)) {
          scene.drawBeneath?.(context, place, creatureLane(swimmer.creature), strength)
        }
        context.globalAlpha = 1

        const rig = rigIsUsable(swimmer.piece.rig) ? swimmer.piece.rig : null
        const kind: CreatureKind = swimmer.piece.rig?.kind ?? 'unknown'
        const drifts = kind === 'tentacled'
        const flying = speciesFlies(swimmer.piece.species)
        /*
         * 頭がどちら側か分かっている絵か。
         *
         * 分かっていないのに動かすと、**頭を振りながら尾から進む**（R-030）。
         * 会場で実際にそう見えた。分からない絵は、しならせず・反転もしない。
         * 止まって見えるほうが、間違った向きに泳ぐより良い
         *（`undulate.ts` の冒頭に書いた原則そのもの）。
         */
        const headKnown = headIsKnown(swimmer.piece.rig)

        context.save()
        context.globalAlpha = appearAlpha(progress)
        context.translate(place.x, place.y)
        /*
         * 頭が進む向きを向くように反転する。
         * 絵の中で頭が右にあるとは限らないので（実物は縦向きだった・R-019）、
         * リグが分かっていればそれに従う。
         * 正面を向いた絵（タコ・イカ）は左右が対称に近いので、反転しても見た目は
         * ほとんど変わらない。揃えておいたほうが規則が1つ減る。
         */
        /*
         * 上から見た絵（ウミガメ）は、**進む向きへ回して**描く。
         * 頭を上に向けたまま横へ動くと、泳いでいるのではなく
         * 板が滑っているように見える。
         * 横向きの絵（魚・イルカ・サメ）は今までどおり左右反転で向きを合わせる。
         */
        const head = swimmer.piece.head
        const turnsToHeading = swimmer.piece.species === 'umigame' && head
        if (turnsToHeading) {
          context.rotate(place.heading - Math.atan2(head.y, head.x))
        }

        const mirror =
          !turnsToHeading && headKnown && place.facingRight !== (swimmer.piece.rig?.headsRight ?? true)

        /*
         * 飛ぶ絵（プテラノドン）は**滑空**にしてある。
         *
         * 縦に縮めて羽ばたきに見せる案は取りやめた。全体が縮むので
         * **頭も嘴も縮み**、「翼が動いた」ではなく「絵が潰れた」に見える（R-039）。
         * ここでやるのは**傾けるだけ**。絵の形は変えないので、どこも歪まない。
         * 本物の羽ばたきは、翼を切り分けられる台紙が来てから（F-511）。
         */
        if (flying && swayRef.current > 0) {
          context.rotate(glideTilt(elapsed * GLIDE_SPEED * swimmer.beat.rate + swimmer.beat.phase))
        }
        context.scale(mirror ? -scale : scale, scale)

        const sway = swayRef.current
        const strips = stripCount(sway)
        const left = -place.width / 2
        const top = -place.height / 2

        /*
         * 手足のある生き物（タコ・ウミガメ）は、絵を矩形に分けて
         * 一部だけを回して描く。分割なので同じ画素を2度描かない。
         * 手足の形に切り抜く（`clip()`）のは使えない（3匹で 0.3fps・R-022）。
         */
        const limbs = partsForPiece(
          swimmer.piece.species,
          swimmer.piece.fit?.turns,
          swimmer.piece.fit?.mirrored,
        )

        if (limbs.length > 0 && sway > 0) {
          const source = swimmer.element.naturalWidth
          const sourceHeight = swimmer.element.naturalHeight
          const time = elapsed * swimmer.beat.rate * LIMB_SPEED
          for (const part of limbs) {
            const angle =
              part.swing === 0
                ? 0
                : part.swing * sway * Math.sin(time + part.beat * Math.PI * 2 + swimmer.beat.phase)
            context.save()
            if (angle !== 0) {
              const pivotX = left + place.width * part.pivot.x
              const pivotY = top + place.height * part.pivot.y
              context.translate(pivotX, pivotY)
              context.rotate(angle)
              context.translate(-pivotX, -pivotY)
            }
            context.drawImage(
              swimmer.element,
              source * part.box.x,
              sourceHeight * part.box.y,
              source * part.box.w,
              sourceHeight * part.box.h,
              left + place.width * part.box.x,
              top + place.height * part.box.y,
              // わずかに広げて、隣との継ぎ目に髪の毛ほどの隙間が出るのを防ぐ
              place.width * part.box.w + 0.5,
              place.height * part.box.h + 0.5,
            )
            context.restore()
          }
        } else if (flying || strips <= 1 || (!headKnown && !drifts)) {
          /*
           * そのまま1枚で描く。
           * - しなり 0（描画命令が1回に戻るので、重いときの逃げ道）
           * - 頭が分からない絵（どちらを止めればよいか決められない）
           * - **飛ぶ絵**（プテラノドン）
           *
           * 飛ぶ絵に魚のしなりを掛けると、**顔がなびく**（実機で確認）。
           * しなりは「胴をくねらせて水を押す」動きなので、
           * 体が硬い生き物に掛けると、旗がはためいているようにしか見えない。
           */
          context.drawImage(swimmer.element, left, top, place.width, place.height)
        } else {
          const source = swimmer.element.naturalWidth
          const sourceHeight = swimmer.element.naturalHeight
          const time = elapsed * swimmer.beat.rate
          const options = { ...UNDULATE, amplitude: UNDULATE.amplitude * sway }
          const headsRight = rig?.headsRight ?? true
          // 尾びれが分かっていれば、胴体はその手前までにする。
          // 尾は胴と別に、付け根を軸に回す。
          const bodyEnd = rig?.tail ? rig.tail.from : 1

          const offsetAt = (fromHead: number): number =>
            stripOffset(fromHead, time, swimmer.beat.phase, options) * place.height

          /*
           * 帯を1枚描く。`fromHead` は頭からの割合で、絵の左右どちらが頭かは
           * リグが持っている。帯ごとに縦の傾き（せん断）を掛けて隣とつなぐ。
           * 中心の値だけで平行移動すると、境目に段差が出て絵が階段状に割れる。
           */
          const drawStrip = (
            nearHead: number,
            farHead: number,
            fin: { readonly side: 'top' | 'bottom'; readonly base: number } | null = null,
          ): void => {
            const leftFrac = headRatioToImageX(headsRight ? farHead : nearHead, headsRight)
            const rightFrac = headRatioToImageX(headsRight ? nearHead : farHead, headsRight)
            const width = place.width * (rightFrac - leftFrac)
            if (width <= 0) return
            const x = left + place.width * leftFrac
            const atLeft = offsetAt(headsRight ? farHead : nearHead)
            const atRight = offsetAt(headsRight ? nearHead : farHead)
            const slope = (atRight - atLeft) / width

            /*
             * ひれが掛かっている帯は、**ひれの側を含めずに**描く。
             * 含めて描くと、別に回したひれと二重に見える。
             */
            const fromY = fin?.side === 'top' ? fin.base : 0
            const toY = fin?.side === 'bottom' ? fin.base : 1

            context.save()
            context.transform(1, slope, 0, 1, 0, atLeft - slope * x)
            context.drawImage(
              swimmer.element,
              source * leftFrac,
              sourceHeight * fromY,
              source * (rightFrac - leftFrac),
              sourceHeight * (toY - fromY),
              x,
              top + place.height * fromY,
              // わずかに広げて、帯の継ぎ目に髪の毛ほどの隙間が出るのを防ぐ
              width + width * 0.02,
              place.height * (toY - fromY),
            )
            context.restore()
          }

          /*
           * 足のある生き物は、**横に切って左右へ**波打たせる。
           * 魚と同じ縦の帯で上下に振ると、胴も足も一緒にずれるだけで、
           * 足が漂っているようには見えない。
           * 波は足の先へ向かって大きくなる。
           */
          const drawBand = (nearBody: number, farBody: number): void => {
            const tipsDown = swimmer.piece.rig?.tipsDown ?? true
            const topFrac = tipsDown ? nearBody : 1 - farBody
            const height = place.height * (farBody - nearBody)
            if (height <= 0) return
            const y = top + place.height * topFrac
            const atTop = offsetAt(tipsDown ? nearBody : farBody)
            const atBottom = offsetAt(tipsDown ? farBody : nearBody)
            // 横方向のずれ。絵の高さではなく幅に対する割合にする
            const shiftTop = (atTop / place.height) * place.width
            const shiftBottom = (atBottom / place.height) * place.width
            const slope = (shiftBottom - shiftTop) / height

            context.save()
            context.transform(1, 0, slope, 1, shiftTop - slope * y, 0)
            context.drawImage(
              swimmer.element,
              0,
              sourceHeight * topFrac,
              source,
              sourceHeight * (farBody - nearBody),
              left,
              y,
              place.width,
              height + height * 0.02,
            )
            context.restore()
          }

          /*
           * 背びれ・腹びれは胴と別に振る。
           *
           * 最初は `clip('evenodd')` で胴からひれの場所を切り抜いたが、
           * **20匹どころか3匹でも 0.3fps まで落ちた**（R-022）。
           * いまは切り抜かず、**元画像の切り出す範囲をずらして**描き分けている。
           * ひれのある帯は「付け根から下（上）だけ」を胴として描き、
           * 残りをひれとして別に回す。費用は帯を1枚増やすのと同じ。
           */
          const fins = drifts ? [] : (swimmer.piece.rig?.fins ?? [])

          /** その位置に掛かっているひれ（無ければ null）。 */
          const finAt = (from: number, to: number): (typeof fins)[number] | null => {
            const centre = (from + to) / 2
            return fins.find((one) => centre >= one.from && centre <= one.to) ?? null
          }

          for (let index = 0; index < strips; index++) {
            if (drifts) {
              drawBand(index / strips, (index + 1) / strips)
              continue
            }
            const nearHead = (index / strips) * bodyEnd
            const farHead = ((index + 1) / strips) * bodyEnd
            // 帯の左右（絵の中での位置）に直してから、ひれが掛かるか見る
            const leftFrac = headRatioToImageX(headsRight ? farHead : nearHead, headsRight)
            const rightFrac = headRatioToImageX(headsRight ? nearHead : farHead, headsRight)
            drawStrip(nearHead, farHead, finAt(leftFrac, rightFrac))
          }

          for (const fin of fins) {
            const centre = (fin.from + fin.to) / 2
            const fromHead = headsRight ? 1 - centre : centre
            const pivotX = left + place.width * centre
            const pivotY = top + place.height * fin.base
            const angle = finAngle(fromHead, time, swimmer.beat.phase, sway, options)
            const x = left + place.width * fin.from
            const boxWidth = place.width * (fin.to - fin.from)
            const fromY = fin.side === 'top' ? 0 : fin.base
            const toY = fin.side === 'top' ? fin.base : 1

            context.save()
            context.translate(pivotX, pivotY + offsetAt(fromHead))
            context.rotate(angle)
            context.translate(-pivotX, -pivotY)
            context.drawImage(
              swimmer.element,
              source * fin.from,
              sourceHeight * fromY,
              source * (fin.to - fin.from),
              sourceHeight * (toY - fromY),
              x,
              top + place.height * fromY,
              boxWidth,
              place.height * (toY - fromY),
            )
            context.restore()
          }

          if (rig?.tail) {
            /*
             * 尾びれは1枚のまま、付け根を軸に回す。
             * 胴体の付け根での縦のずれも一緒に掛けて、胴から離れないようにする。
             * 継ぎ目を隠すため、付け根より少し頭寄りから切り出す。
             */
            const overlap = 0.03
            const startHead = Math.max(0, rig.tail.from - overlap)
            const leftFrac = headsRight ? 0 : startHead
            const rightFrac = headsRight ? headRatioToImageX(startHead, true) : 1
            const width = place.width * (rightFrac - leftFrac)

            if (width > 0) {
              const pivotX = left + place.width * rig.tail.pivot.x
              const pivotY = top + place.height * rig.tail.pivot.y
              const angle = tailAngle(rig.tail.from, time, swimmer.beat.phase, sway, options)

              context.save()
              context.translate(pivotX, pivotY + offsetAt(rig.tail.from))
              context.rotate(angle)
              context.translate(-pivotX, -pivotY)
              context.drawImage(
                swimmer.element,
                source * leftFrac,
                0,
                source * (rightFrac - leftFrac),
                sourceHeight,
                left + place.width * leftFrac,
                top,
                width,
                place.height,
              )
              context.restore()
            }
          }
        }
        context.restore()
      }

      scene.drawBehind(context, elapsed, strength)

      if (scene.lanes.length === 0) {
        for (const swimmer of list) drawSwimmer(swimmer)
      } else {
        // 奥の地面 → その列の絵 → 次の地面、の順。まとめて描くと
        // 手前の地面が奥の絵にかぶさって足が埋まる。
        for (let index = 0; index < scene.lanes.length; index++) {
          scene.drawLane(context, index, elapsed, strength)
          for (const swimmer of list) {
            if (creatureLane(swimmer.creature) === index) drawSwimmer(swimmer)
          }
        }
      }

      scene.drawFront(context, elapsed, strength)

      if (measure) {
        measure.frames++
        // 実際に何コマ描けているかを測る。canvas の描画命令は非同期に処理されるので、
        // JS の経過時間を測っても 0ms にしかならず、なめらかさは分からない。
        if (measure.total === 0) measure.total = now
        if (now - measure.total >= 2000) {
          measure.last = (measure.frames * 1000) / (now - measure.total)
          measure.frames = 0
          measure.total = now
        }
        // 外から読めるようにしておく。fps は会場と開発機で最も食い違う数字なので、
        // 目で読むだけでなく機械で取れる形が要る（R-012）。`?measure` のときだけ。
        ;(window as unknown as { __aquaFps?: number }).__aquaFps = measure.last
        if (measure.last > 0) {
          context.save()
          context.fillStyle = 'rgba(0,0,0,0.6)'
          context.fillRect(8, 8, 300, 34)
          context.fillStyle = '#9fe8ff'
          context.font = '16px monospace'
          context.fillText(
            `${measure.last.toFixed(1)} fps`,
            16,
            30,
          )
          context.restore()
        }
      }

      animationId = requestAnimationFrame(frame)
    }

    animationId = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="aquarium" />
}
