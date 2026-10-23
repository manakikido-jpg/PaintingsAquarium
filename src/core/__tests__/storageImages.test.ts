import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { savePiece, updatePiece, readPieces, readPieceImage } from '../../../electron/storage'
import { pieceImageUrl } from '../pieceImage'

const state = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.root } }))

beforeEach(() => { state.root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqua-image-test-')) })
afterEach(() => { fs.rmSync(state.root, { recursive: true, force: true }) })

describe('同じidの保存画像を作り直す', () => {
  it('画像の置き換えをURLへ反映し、メタデータだけの更新では再読み込みしない', () => {
    const original = Buffer.from('original-image').toString('base64')
    const replacement = Buffer.from('replacement-image').toString('base64')
    const piece = savePiece({ key: 'sample:1', fileName: 'sample.png', width: 100, height: 80,
      imageBase64: original, theme: 'halloween' })
    const metadata = updatePiece(piece.id, { built: 999 })!
    expect(pieceImageUrl(metadata)).toBe(pieceImageUrl(piece))
    const rebuilt = updatePiece(piece.id, { imageBase64: replacement })!
    expect(rebuilt.id).toBe(piece.id)
    expect(rebuilt.imageRevision).toBe(1)
    expect(pieceImageUrl(rebuilt)).not.toBe(pieceImageUrl(piece))
    expect(readPieceImage(piece.id)).toBe(replacement)
    expect(readPieces()[0].imageRevision).toBe(1)
    const again = updatePiece(piece.id, { imageBase64: original, theme: 'halloween' })!
    expect(again.imageRevision).toBe(2)
    expect(pieceImageUrl(again)).not.toBe(pieceImageUrl(rebuilt))
  })

  it('古い台帳はそのまま読め、存在しない絵を更新しても増えない', () => {
    expect(pieceImageUrl({ id: 'old-piece' })).toContain('revision=0')
    expect(updatePiece('missing', { imageBase64: 'YWJj' })).toBeNull()
    expect(readPieces()).toEqual([])
  })
})
