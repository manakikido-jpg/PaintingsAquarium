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
  /** 最終更新時刻（ミリ秒）。古い呼び出しには入っていない */
  readonly modifiedMs?: number
}

/**
 * 同じ写真を二重に泳がせないための鍵。
 *
 * 中身のハッシュではなく**ファイル名・サイズ・更新時刻**にしている。
 * 全画素を読んでハッシュを取るほうが正確だが、取り込みが目に見えて遅くなり、
 * 「置いたらすぐ泳ぐ」体験を壊す。
 *
 * **更新時刻を入れているのは、スキャナが番号を振り直すため（R-064）。**
 * `img001.jpg` が使い回されると、別の絵なのに名前が同じになる。
 * サイズまで一致すると**取り込み済み扱いで黙って落ちる**
 *（お知らせを「出さない」にしていると、落ちたことにも気づけない）。
 * 更新時刻まで見れば、別のときに取り込んだ紙は必ず別の鍵になる。
 */
export function ingestKey(facts: FileFacts): string {
  const stamp = facts.modifiedMs === undefined ? '' : `:${Math.round(facts.modifiedMs)}`
  return `${facts.fileName}:${facts.sizeBytes}${stamp}`
}

/**
 * 更新時刻を入れる前の鍵。
 *
 * **見張るフォルダは起動のたびに丸ごと読み直される**（`ignoreInitial: false`）ので、
 * 鍵の形を変えただけだと、**すでに取り込んだ絵が次の起動で全部もう一度入る**。
 * 古い鍵でも取り込み済みとみなすことで、それを防ぐ。
 */
export function legacyIngestKey(facts: FileFacts): string {
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
  // 古い形の鍵で取り込んだ絵も「取り込み済み」とみなす（R-064）
  if (alreadyIngested.has(key) || alreadyIngested.has(legacyIngestKey(facts))) {
    return {
      ingest: false,
      reason: 'already-ingested',
      message: `${fileName} は取り込み済みです。もう一度泳がせたいときは、一覧から削除してからファイル名を変えて入れ直してください。`,
    }
  }

  return { ingest: true, key }
}
