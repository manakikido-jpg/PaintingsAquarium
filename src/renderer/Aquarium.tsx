import { useEffect, useRef } from 'react'
import type { Tank } from '../core/swim'
import {
  creatureLane,
  placeCreature,
  spawnCreature,
  stepCreatures,
  type Creature,
} from '../core/motion'
import { appearAlpha, appearProgress, appearScale, isNewlyArrived } from '../core/appear'
import {
  DEFAULT_UNDULATE as UNDULATE,
  beatPhase,
  beatRate,
  stripCount,
  stripOffset,
} from '../core/undulate'
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
}: {
  pieces: Piece[]
  theme: ThemeId
  sceneryStrength: number
  decorDensity: number
  swayStrength: number
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
    let builtFor = { width: -1, height: -1, theme: '', density: -1 }

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
    const rebuild = (tank: Tank, theme: ThemeId, density: number): boolean => {
      if (
        builtFor.width === tank.width &&
        builtFor.height === tank.height &&
        builtFor.theme === theme &&
        builtFor.density === density
      ) {
        return false
      }
      builtFor = { width: tank.width, height: tank.height, theme, density }
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
      rebuild(tank, themeRef.current, densityRef.current)
      if (!scene) {
        animationId = requestAnimationFrame(frame)
        return
      }

      const swimmers = swimmersRef.current
      const wanted = new Set(piecesRef.current.map((piece) => piece.id))
      for (const id of swimmers.keys()) {
        if (!wanted.has(id)) swimmers.delete(id)
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
          beat: { rate: beatRate(seedOf(piece.id)), phase: beatPhase(seedOf(piece.id)) },
          creature: spawnCreature(
            scene.motion,
            seedOf(piece.id),
            tank,
            piece.width,
            piece.height,
            scene.lanes,
          ),
        })
      }

      const list = [...swimmers.values()]
      const stepped = stepCreatures(
        list.map((swimmer) => swimmer.creature),
        dt,
        tank,
      )
      for (let index = 0; index < list.length; index++) list[index].creature = stepped[index]

      const drawSwimmer = (swimmer: Swimmer): void => {
        if (!swimmer.element.complete || swimmer.element.naturalWidth === 0) return
        if (!scene) return

        const place = placeCreature(swimmer.creature, scene.lanes)
        const progress = appearProgress(elapsed - swimmer.bornAt)
        const scale = appearScale(progress)

        context.globalAlpha = appearAlpha(progress)
        scene.drawBeneath?.(context, place, creatureLane(swimmer.creature), strength)
        context.globalAlpha = 1

        context.save()
        context.globalAlpha = appearAlpha(progress)
        context.translate(place.x, place.y)
        // 進む向きに合わせて左右反転する。後ろ向きに進んで見えるのを避けるため。
        context.scale(place.facingRight ? scale : -scale, scale)

        const sway = swayRef.current
        const strips = stripCount(sway)
        const left = -place.width / 2
        const top = -place.height / 2

        if (strips <= 1) {
          // しなり 0。描画命令が1回に戻るので、重いときの逃げ道になる。
          context.drawImage(swimmer.element, left, top, place.width, place.height)
        } else {
          const source = swimmer.element.naturalWidth
          const time = elapsed * swimmer.beat.rate
          const options = { ...UNDULATE, amplitude: UNDULATE.amplitude * sway }
          /*
           * 帯の「中心」ではなく「両端」のずれを求め、帯ごとに縦の傾き（せん断）を
           * 掛ける。中心の値だけで平行移動すると、隣の帯との境目に段差が出て
           * 絵が階段状に割れて見える。傾ければ端の高さが隣と一致して段差が消える。
           */
          const offsetAt = (fromHead: number): number =>
            stripOffset(fromHead, time, swimmer.beat.phase, options) * place.height

          for (let index = 0; index < strips; index++) {
            const headSide = index / strips
            const tailSide = (index + 1) / strips
            // 頭は進行方向の側＝絵の右。だから頭に近い帯ほど元画像の右を使う。
            const fromLeft = 1 - tailSide
            const x = left + place.width * fromLeft
            const width = place.width / strips
            const atLeft = offsetAt(tailSide)
            const atRight = offsetAt(headSide)
            const slope = (atRight - atLeft) / width

            context.save()
            context.transform(1, slope, 0, 1, 0, atLeft - slope * x)
            context.drawImage(
              swimmer.element,
              source * fromLeft,
              0,
              source / strips,
              swimmer.element.naturalHeight,
              x,
              top,
              // わずかに広げて、帯の継ぎ目に髪の毛ほどの隙間が出るのを防ぐ
              width + width * 0.02,
              place.height,
            )
            context.restore()
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
