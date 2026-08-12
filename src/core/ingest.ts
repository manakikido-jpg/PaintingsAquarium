/**
 * 取り込みフォルダを見張るときの判定。ファイル I/O は含めず、
 * 「このファイルを取り込むべきか」だけを決める。
 */

export const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const

export type SkipReason = 'unsupported-extension' | 'hidden-file' | 'already-ingested'

export type IngestDecision =
  | { ingest: true; key: string }
  | { ingest: false; reason: SkipReason; message: string }

export interface FileFacts {
  readonly fileName: string
  readonly sizeBytes: number
}

/**
 * 同じ写真を二重に泳がせないための鍵。
 *
 * 中身のハッシュではなくファイル名とサイズにしている。
 * 会場では 1 日 200 枚をカメラから流し込むだけで、同じ写真が別名で
 * 入ることは想定していない。全画素を読んでハッシュを取るほうが正確だが、
 * 取り込みが目に見えて遅くなり、「置いたらすぐ泳ぐ」体験を壊す。
 * 別名の同一写真が問題になったらここをハッシュに変える。
 */
export function ingestKey(facts: FileFacts): string {
  return `${facts.fileName}:${facts.sizeBytes}`
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot < 0 ? '' : fileName.slice(dot).toLowerCase()
}

export function isSupportedImage(fileName: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extensionOf(fileName))
}

/**
 * HEIC を弾いているのは、iPhone の既定形式でありながら Chromium が
 * デコードできないため。無言で無視すると「入れたのに泳がない」になるので、
 * 直し方まで書いたメッセージを返す。
 */
export function decideIngest(facts: FileFacts, alreadyIngested: ReadonlySet<string>): IngestDecision {
  const { fileName } = facts

  // macOS の .DS_Store や、コピー途中の一時ファイルを拾わないため。
  if (fileName.startsWith('.') || fileName.startsWith('~')) {
    return {
      ingest: false,
      reason: 'hidden-file',
      message: `${fileName} は隠しファイルなので取り込みません。`,
    }
  }

  if (!isSupportedImage(fileName)) {
    const extension = extensionOf(fileName) || '（拡張子なし）'
    const hint =
      extension === '.heic' || extension === '.heif'
        ? 'iPhone の設定で「カメラ」→「フォーマット」を「互換性優先」にすると JPEG で保存されます。'
        : `対応しているのは ${SUPPORTED_EXTENSIONS.join(' / ')} です。`
    return {
      ingest: false,
      reason: 'unsupported-extension',
      message: `${fileName} は ${extension} なので取り込めません。${hint}`,
    }
  }

  const key = ingestKey(facts)
  if (alreadyIngested.has(key)) {
    return {
      ingest: false,
      reason: 'already-ingested',
      message: `${fileName} は取り込み済みです。もう一度泳がせたいときは、一覧から削除してからファイル名を変えて入れ直してください。`,
    }
  }

  return { ingest: true, key }
}
