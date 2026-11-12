/** 受付時の設定を保持して順番に処理する。1件失敗しても次の絵を止めない。 */
export function enqueueWithSnapshot<T>(
  previous: Promise<void>,
  context: T | Promise<T>,
  task: (snapshot: T) => Promise<void>,
  onError: (error: unknown) => void,
): Promise<void> {
  // 処理待ちの間に設定取得が失敗しても、未処理のPromise拒否にしない。
  const snapshot = Promise.resolve(context).then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error }),
  )
  return previous.catch(() => undefined).then(async () => {
    const captured = await snapshot
    if (!captured.ok) throw captured.error
    await task(captured.value)
  }).catch(onError)
}
