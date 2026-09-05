import { describe, expect, it } from 'vitest'
import {
  decideIngest,
  extensionOf,
  ingestKey,
  isSupportedImage,
  legacyIngestKey,
} from '../ingest'

describe('extensionOf', () => {
  it('大文字でも小文字に揃える', () => {
    expect(extensionOf('IMG_0001.JPG')).toBe('.jpg')
  })

  it('拡張子が無ければ空文字', () => {
    expect(extensionOf('README')).toBe('')
  })
})

describe('isSupportedImage', () => {
  it('jpg / png / webp は対応', () => {
    expect(isSupportedImage('a.jpg')).toBe(true)
    expect(isSupportedImage('a.jpeg')).toBe(true)
    expect(isSupportedImage('a.png')).toBe(true)
    expect(isSupportedImage('a.webp')).toBe(true)
  })

  it('heic は非対応（Chromium がデコードできないため）', () => {
    expect(isSupportedImage('a.heic')).toBe(false)
  })
})

describe('decideIngest', () => {
  const empty = new Set<string>()

  it('対応形式の新しいファイルは取り込む', () => {
    const decision = decideIngest({ fileName: 'IMG_0001.jpg', sizeBytes: 1234 }, empty)
    expect(decision).toEqual({ ingest: true, key: 'IMG_0001.jpg:1234' })
  })

  it('隠しファイルは無視する（.DS_Store 対策）', () => {
    const decision = decideIngest({ fileName: '.DS_Store', sizeBytes: 6148 }, empty)
    expect(decision.ingest).toBe(false)
    if (decision.ingest) return
    expect(decision.reason).toBe('hidden-file')
  })

  it('HEIC は、どう設定を変えれば通るかまで伝える', () => {
    const decision = decideIngest({ fileName: 'IMG_0002.HEIC', sizeBytes: 1 }, empty)
    expect(decision.ingest).toBe(false)
    if (decision.ingest) return
    expect(decision.reason).toBe('unsupported-extension')
    expect(decision.message).toContain('互換性優先')
  })

  it('非対応の拡張子は、対応形式を挙げて伝える', () => {
    const decision = decideIngest({ fileName: 'memo.txt', sizeBytes: 1 }, empty)
    expect(decision.ingest).toBe(false)
    if (decision.ingest) return
    expect(decision.message).toContain('.jpg')
  })

  it('取り込み済みなら二重に泳がせない', () => {
    const seen = new Set([ingestKey({ fileName: 'IMG_0001.jpg', sizeBytes: 1234 })])
    const decision = decideIngest({ fileName: 'IMG_0001.jpg', sizeBytes: 1234 }, seen)
    expect(decision.ingest).toBe(false)
    if (decision.ingest) return
    expect(decision.reason).toBe('already-ingested')
  })

  it('同じ名前でもサイズが違えば別の写真として取り込む', () => {
    const seen = new Set([ingestKey({ fileName: 'IMG_0001.jpg', sizeBytes: 1234 })])
    expect(decideIngest({ fileName: 'IMG_0001.jpg', sizeBytes: 9999 }, seen).ingest).toBe(true)
  })
})

describe('鍵に更新時刻を入れる（R-064）', () => {
  /*
   * **スキャナは番号を振り直す。** `img001.jpg` が使い回されると、
   * 別の絵なのに名前が同じになる。サイズまで一致すると
   * 取り込み済み扱いで黙って落ちていた。
   */
  it('名前とサイズが同じでも、撮った時刻が違えば別の絵とみなす', () => {
    const morning = { fileName: 'img001.jpg', sizeBytes: 120_000, modifiedMs: 1_000_000 }
    const afternoon = { fileName: 'img001.jpg', sizeBytes: 120_000, modifiedMs: 2_000_000 }
    expect(ingestKey(morning)).not.toBe(ingestKey(afternoon))

    const seen = new Set([ingestKey(morning)])
    expect(decideIngest(afternoon, seen).ingest).toBe(true)
  })

  it('同じファイルなら、何度見ても取り込まない', () => {
    const facts = { fileName: 'img001.jpg', sizeBytes: 120_000, modifiedMs: 1_000_000 }
    const seen = new Set([ingestKey(facts)])
    expect(decideIngest(facts, seen).ingest).toBe(false)
  })

  /*
   * **見張るフォルダは起動のたびに丸ごと読み直される。**
   * 鍵の形を変えただけだと、すでに取り込んだ絵が次の起動で全部もう一度入る。
   */
  it('更新時刻を入れる前の鍵で取り込んだ絵も、取り込み済みとみなす', () => {
    const facts = { fileName: 'img001.jpg', sizeBytes: 120_000, modifiedMs: 1_000_000 }
    const seen = new Set([legacyIngestKey(facts)])
    const decision = decideIngest(facts, seen)
    expect(decision.ingest).toBe(false)
    if (!decision.ingest) expect(decision.reason).toBe('already-ingested')
  })
})
