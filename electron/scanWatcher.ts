import chokidar, { type FSWatcher } from 'chokidar'

/** 番号を再利用して上書きするスキャナも、再起動なしで拾う。 */
export function watchScanFolder(folder: string, onFile: (filePath: string) => void): FSWatcher {
  const watcher = chokidar.watch(folder, {
    depth: 0,
    ignoreInitial: false,
    // 書き込み途中の画像を読まないよう、サイズが安定してから通知する。
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
  })
  watcher.on('add', onFile)
  watcher.on('change', onFile)
  return watcher
}
