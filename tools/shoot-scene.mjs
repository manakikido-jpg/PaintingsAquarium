/**
 * 実機（Electron）を起動して、**画面そのものの写真**を撮る。
 *
 * **なぜ道具にしてあるか** — 企画書に載せている画面写真は、手で撮ると
 * 古いまま残る。実際、かぼちゃを地面に下ろしたあとも
 * 「かぼちゃが空に浮いている」写真が企画書に載ったままだった。
 * 動きを変えたら、この道具で撮り直して企画書を作り直すこと。
 *
 * **canvas の中身を直に取り出す。** 画面の写真を撮ると、canvas の上に
 * 重なっている案内の文字（`.hint` ＝ S: 設定と一覧 …）まで写る。
 * 載せたいのは「大画面に映る絵」なので、描かれた画素のほうを取る。
 *
 * 使い方:
 *   xvfb-run -a --server-args="-screen 0 1600x840x24" \
 *     node tools/shoot-scene.mjs <userDataのフォルダ> <出力.png> [幅] [高さ] [待つ秒数]
 *
 * `userDataのフォルダ` には、見せたいテーマの絵が取り込んである必要がある。
 * 待つ秒数は、絵が散らばって良い配置になるまでの時間（既定 60 秒）。
 */
import { _electron as electron } from 'playwright'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

const [userData, out, width = '1600', height = '840', wait = '60'] = process.argv.slice(2)
if (!userData || !out) {
  console.error('使い方: node tools/shoot-scene.mjs <userDataのフォルダ> <出力.png> [幅] [高さ] [待つ秒数]')
  process.exit(1)
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const app = await electron.launch({
  executablePath: path.join(root, 'node_modules/electron/dist/electron'),
  args: [root, '--no-sandbox', `--user-data-dir=${path.resolve(userData)}`],
})
const page = await app.firstWindow()
await page.setViewportSize({ width: Number(width), height: Number(height) })
await page.waitForTimeout(Number(wait) * 1000)

const dataUrl = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')
  if (!canvas) throw new Error('canvas が見つからない')
  return canvas.toDataURL('image/png')
})
writeFileSync(path.resolve(out), Buffer.from(dataUrl.split(',')[1], 'base64'))
await app.close()
console.log(`${path.resolve(out)} に書きました`)
