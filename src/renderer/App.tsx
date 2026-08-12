import { useCallback, useEffect, useRef, useState } from 'react'
import { Aquarium } from './Aquarium'
import { processPhoto } from './processImage'
import type { IncomingPhoto, Notice, Piece, Settings } from '../shared/types'

export function App(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [pieces, setPieces] = useState<Piece[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [panelOpen, setPanelOpen] = useState(false)

  // 取り込みは 1 枚ずつ順番に。同時に走らせると重い写真で画面が固まり、
  // 泳いでいる絵がカクつく（来場者から見えるのはそこ）。
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const settingsRef = useRef<Settings | null>(null)
  settingsRef.current = settings

  const pushNotice = useCallback((notice: Notice) => {
    setNotices((current) => [...current.slice(-4), notice])
    window.setTimeout(() => setNotices((current) => current.slice(1)), 12000)
  }, [])

  useEffect(() => {
    void window.aquarium.getSettings().then(setSettings)
    void window.aquarium.listPieces().then(setPieces)
  }, [])

  useEffect(() => window.aquarium.onNotice(pushNotice), [pushNotice])

  useEffect(() => {
    return window.aquarium.onIncoming((photo: IncomingPhoto) => {
      queueRef.current = queueRef.current.then(async () => {
        // 設定の読み込みは非同期なので、起動直後に届いた写真では
        // まだ null のことがある。ここで諦めると写真が黙って消える（R-002）。
        const current = settingsRef.current ?? (await window.aquarium.getSettings())
        settingsRef.current = current

        const result = await processPhoto(photo.dataUrl, photo.fileName, current.cutout)
        if (!result.ok) {
          pushNotice({ level: 'warn', message: result.message })
          return
        }

        if (result.touchedBorder) {
          pushNotice({
            level: 'warn',
            message: `${photo.fileName}: 絵が写真の端まで写っています。紙のまわりに余白を入れて撮ると、紙の影を取り除けます。`,
          })
        }

        const piece = await window.aquarium.savePiece({
          key: photo.key,
          fileName: photo.fileName,
          width: result.width,
          height: result.height,
          pngBase64: result.pngBase64,
        })
        setPieces((current) => [...current, piece])
      })
    })
  }, [pushNotice])

  // 運営者しか使わない画面なので、ボタンを常設せずキーで開く。
  // 常設すると大画面に管理用の要素が映り込み、来場者の視界に入る。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 's' || event.key === 'S') setPanelOpen((open) => !open)
      if (event.key === 'f' || event.key === 'F') void window.aquarium.toggleFullscreen()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const visible = settings ? pieces.slice(-settings.maxVisible) : []
  const today = new Date().toISOString().slice(0, 10)
  const todayCount = pieces.filter((piece) => piece.createdAt.startsWith(today)).length

  const handleDelete = async (id: string): Promise<void> => {
    await window.aquarium.deletePiece(id)
    setPieces((current) => current.filter((piece) => piece.id !== id))
  }

  const patchCutout = async (patch: Partial<Settings['cutout']>): Promise<void> => {
    if (!settings) return
    setSettings(await window.aquarium.updateSettings({ cutout: { ...settings.cutout, ...patch } }))
  }

  return (
    <div className="app">
      <Aquarium pieces={visible} sceneryStrength={settings?.sceneryStrength ?? 1} />

      {settings && settings.watchFolder === null && (
        <div className="setup">
          <h1>写真を入れるフォルダを決めてください</h1>
          <p>
            決めたあとは、そのフォルダに写真を入れるだけです。
            アプリの操作は要りません。
          </p>
          <button
            type="button"
            onClick={async () => setSettings(await window.aquarium.chooseWatchFolder())}
          >
            フォルダを選ぶ
          </button>
        </div>
      )}

      <div className="notices">
        {notices.map((notice, index) => (
          <div key={index} className={`notice notice--${notice.level}`}>
            {notice.message}
          </div>
        ))}
      </div>

      <div className="hint">S: 設定と一覧 ／ F: 全画面</div>

      {panelOpen && settings && (
        <div className="panel">
          <div className="panel__header">
            <strong>設定と一覧</strong>
            <button type="button" onClick={() => setPanelOpen(false)}>
              閉じる
            </button>
          </div>

          <section>
            <div className="row">
              <span>取り込みフォルダ</span>
              <code>{settings.watchFolder ?? '未設定'}</code>
              <button
                type="button"
                onClick={async () => setSettings(await window.aquarium.chooseWatchFolder())}
              >
                変更
              </button>
            </div>
            <div className="row">
              <span>今日の取り込み</span>
              <strong>{todayCount} 枚</strong>
              <span>（全部で {pieces.length} 枚）</span>
            </div>
          </section>

          <section>
            <label>
              紙とみなす明るさ: {settings.cutout.paperValue.toFixed(2)}
              <input
                type="range"
                min="0.3"
                max="1"
                step="0.01"
                value={settings.cutout.paperValue}
                onChange={(event) => void patchCutout({ paperValue: Number(event.target.value) })}
              />
            </label>
            <label>
              紙とみなす色の薄さ: {settings.cutout.paperSaturation.toFixed(2)}
              <input
                type="range"
                min="0"
                max="0.6"
                step="0.01"
                value={settings.cutout.paperSaturation}
                onChange={(event) =>
                  void patchCutout({ paperSaturation: Number(event.target.value) })
                }
              />
            </label>
            <p className="note">
              絵が消えすぎるときは「明るさ」を上げ、紙の白が残るときは下げてください。
              変更は次に取り込む写真から効きます。
            </p>
          </section>

          <section>
            <label>
              背景の強さ: {settings.sceneryStrength.toFixed(2)}
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.sceneryStrength}
                onChange={(event) =>
                  void window.aquarium
                    .updateSettings({ sceneryStrength: Number(event.target.value) })
                    .then(setSettings)
                }
              />
            </label>
            <p className="note">
              光の筋や泡が絵より目立つときは下げてください。0 にすると無地になります。
              こちらは動かした瞬間に反映されます。
            </p>
          </section>

          <section className="pieces">
            {pieces.length === 0 && <p className="note">まだ 1 枚も取り込んでいません。</p>}
            {[...pieces].reverse().map((piece) => (
              <figure key={piece.id}>
                <img src={`aqua://piece/${piece.id}`} alt={piece.fileName} />
                <figcaption>{piece.fileName}</figcaption>
                <button type="button" onClick={() => void handleDelete(piece.id)}>
                  消す
                </button>
              </figure>
            ))}
          </section>
        </div>
      )}
    </div>
  )
}
