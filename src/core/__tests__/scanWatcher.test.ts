import { expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { watchScanFolder } from '../../../electron/scanWatcher'

it('スキャナの同名・同サイズ上書きを監視し、書込みが落ち着いてから完成内容を渡す', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-watch-'))
  const file = path.join(folder, 'scan.jpg')
  const received: string[] = []
  const watcher = watchScanFolder(folder, name => received.push(fs.readFileSync(name, 'utf8')))
  try {
    await once(watcher, 'ready')
    fs.writeFileSync(file, 'first image')
    await expect.poll(() => received, { timeout: 5000 }).toEqual(['first image'])
    // 別の紙を同じ番号へ保存する機種。サイズだけでは区別できない。
    fs.writeFileSync(file, 'next')
    await new Promise(resolve => setTimeout(resolve, 150))
    fs.appendFileSync(file, ' image!')
    await expect.poll(() => received, { timeout: 5000 }).toEqual(['first image', 'next image!'])
  } finally {
    await watcher.close()
    fs.rmSync(folder, { recursive: true, force: true })
  }
}, 15000)
