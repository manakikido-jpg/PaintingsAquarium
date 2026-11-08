import backgroundUrl from '../../../assets/scene/zoo-background.png?url'
import { makeLanes } from '../../core/walk'
import type { Tank } from '../../core/swim'
import type { Scene } from './types'

/** 背景画像も同梱し、会場のネット接続なしで動かす。 */
export function createZooScene(tank: Tank, decorDensity = 1): Scene {
  const background = new Image()
  background.src = backgroundUrl
  const lanes = makeLanes(tank, 8, {
    backRatio: 0.64, frontRatio: 0.94, minScale: 0.75, maxScale: 1,
  })
  return {
    motion: 'walk', lanes, drawsFlat: true,
    drawBehind(context, elapsed, strength) {
      context.fillStyle = '#d7edc5'
      context.fillRect(0, 0, tank.width, tank.height)
      if (strength <= 0) return
      if (background.complete && background.naturalWidth > 0) {
        // 地面の高さを画面の割合で決めるため、背景も同じ画面へ合わせる。
        context.drawImage(background, 0, 0, tank.width, tank.height)
      }
      context.fillStyle = `rgba(237,248,222,${(1 - Math.min(1, strength)) * 0.85})`
      context.fillRect(0, 0, tank.width, tank.height)
      // 風の粒は上空だけ。子どもの絵が歩く中央を空ける。
      for (let i = 0; i < Math.round(6 * decorDensity); i++) {
        const x = ((i * 0.173 + elapsed * 0.006) % 1) * tank.width
        const y = (0.16 + 0.09 * Math.sin(elapsed * 0.4 + i * 2.3)) * tank.height
        context.fillStyle = 'rgba(255,255,236,0.4)'
        context.beginPath()
        context.ellipse(x, y, 3, 1.3, -0.4, 0, Math.PI * 2)
        context.fill()
      }
    },
    drawLane() {},
    drawBeneath(context, place, _lane, strength) {
      if (strength <= 0) return
      context.fillStyle = 'rgba(40,74,36,0.13)'
      context.beginPath()
      context.ellipse(place.x, place.y + place.height / 2,
        place.width * 0.35, Math.max(2, place.height * 0.025), 0, 0, Math.PI * 2)
      context.fill()
    },
    drawFront() {},
  }
}
