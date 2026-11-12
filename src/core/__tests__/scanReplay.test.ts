import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { savePiece, readPieces, readPieceImage } from '../../../electron/storage'

const state = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.root } }))
beforeEach(() => { state.root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-replay-')) })
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(state.root, { recursive: true, force: true }) })

it('同じ受付キーを100回再送しても1枚だけ保存し、最初の色と種類を保つ', () => {
  const input = { key: 'scan.png:100:1000', fileName: 'scan.png', width: 100, height: 80,
    imageBase64: Buffer.from('first-colored-image').toString('base64'), theme: 'zoo' as const, species: 'zou' as const }
  const first = savePiece(input)
  for (let i = 0; i < 100; i++) {
    expect(savePiece({ ...input, imageBase64: Buffer.from('replayed').toString('base64') })).toEqual(first)
  }
  expect(readPieces()).toEqual([first])
  expect(readPieceImage(first.id)).toBe(input.imageBase64)
  expect(fs.readdirSync(path.join(state.root, 'data/pieces'))).toHaveLength(1)
  const overwritten = savePiece({ ...input, key: 'scan.png:100:2000' })
  expect(overwritten.id).not.toBe(first.id)
  expect(readPieces()).toHaveLength(2)
})

it('台帳の保存に失敗しても既存の絵を保ち、未登録の画像を残さず再試行できる', () => {
  const input = { key: 'existing', fileName: 'existing.png', width: 100, height: 80,
    imageBase64: Buffer.from('existing-colors').toString('base64'), theme: 'zoo' as const }
  const original = savePiece(input)
  const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('ENOSPC simulated') })
  expect(() => savePiece({ ...input, key: 'retry' })).toThrow('ENOSPC simulated')
  rename.mockRestore()
  expect(fs.existsSync(path.join(state.root, 'data/pieces.json.tmp'))).toBe(false)
  expect(readPieces()).toEqual([original])
  expect(readPieceImage(original.id)).toBe(input.imageBase64)
  expect(fs.readdirSync(path.join(state.root, 'data/pieces'))).toHaveLength(1)
  savePiece({ ...input, key: 'retry' })
  expect(readPieces()).toHaveLength(2)
})

it('画像の途中書込みが失敗しても、その不完全な新規画像を残さない', () => {
  const write = fs.writeFileSync
  const spy = vi.spyOn(fs, 'writeFileSync').mockImplementationOnce((file) => {
    write(file, 'partial')
    throw new Error('write interrupted')
  })
  expect(() => savePiece({ key: 'partial', fileName: 'scan.png', width: 100, height: 80,
    imageBase64: 'YWJj', theme: 'zoo' })).toThrow('write interrupted')
  spy.mockRestore()
  expect(readPieces()).toEqual([])
  expect(fs.readdirSync(path.join(state.root, 'data/pieces'))).toEqual([])
})
