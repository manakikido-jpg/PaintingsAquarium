import backgroundUrl from '../../../assets/scene/zoo-background.png?url'
import cloudUrl from '../../../assets/scene/zoo-cloud.png?url'
import { zooBirds, zooClouds } from '../../core/zooSky'
import { makeZooLanes } from '../../core/walk'
import type { Tank } from '../../core/swim'
import type { Scene } from './types'

/** 背景画像も同梱し、会場のネット接続なしで動かす。 */
export function createZooScene(tank: Tank, decorDensity = 1): Scene {
  const background = new Image()
  background.src = backgroundUrl
  const cloud = new Image()
  cloud.src = cloudUrl
  const lanes = makeZooLanes(tank)
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
      context.save()
      if (cloud.complete && cloud.naturalWidth > 0) {
        const ratio = cloud.naturalHeight / cloud.naturalWidth
        for (const sprite of zooClouds(elapsed)) {
          // 横長画面でも雲が看板まで下がらないよう、高さも上限にする。
          const width = Math.min(sprite.width * tank.width, tank.height * 0.065 / ratio)
          const height = width * ratio
          context.globalAlpha = sprite.alpha
          context.drawImage(cloud, sprite.x * tank.width - width / 2,
            sprite.y * tank.height - height / 2, width, height)
        }
      }
      context.strokeStyle = '#506e7a'
      context.fillStyle = '#506e7a'
      context.lineCap = 'round'
      context.lineWidth = Math.max(1, tank.width * 0.001)
      for (const bird of zooBirds(elapsed, decorDensity)) {
        const size = Math.min(bird.width * tank.width, tank.height * 0.02)
        const wing = (0.3 + bird.wing * 0.7) * size * 0.28
        context.save()
        context.globalAlpha = bird.alpha
        context.translate(bird.x * tank.width, bird.y * tank.height)
        context.scale(bird.direction, 1)
        context.beginPath()
        context.moveTo(-size / 2, -wing)
        context.quadraticCurveTo(-size * 0.23, -size * 0.12, 0, 0)
        context.quadraticCurveTo(size * 0.23, -size * 0.12, size / 2, -wing)
        context.stroke()
        context.restore()
      }
      context.restore()
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
