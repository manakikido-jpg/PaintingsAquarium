import { useCallback, useEffect, useRef, useState } from 'react'
import { Aquarium } from './Aquarium'
import { processPhoto } from './processImage'
import type {
  IncomingPhoto,
  Notice,
  Piece,
  Settings,
  StorageLocation,
  UpdateStatus,
} from '../shared/types'
import { THEMES, themeOf, type ThemeId } from '../core/theme'
import { GALLERY_PAGE_SIZE, galleryPage } from '../core/gallery'

export function App(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [storage, setStorage] = useState<StorageLocation | null>(null)
  /**
   * 更新の確認。**押したときだけ通信する**（要件定義 §4 を守るため、
   * 起動時には見に行かない）。
   */
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const [updating, setUpdating] = useState(false)
  const [pieces, setPieces] = useState<Piece[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  // 一覧に出している枚数。全件を一度に描くと会期後半に固まる（R-014）。
  const [shown, setShown] = useState(GALLERY_PAGE_SIZE)

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
    void window.aquarium.getStorageLocation().then(setStorage)
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

        if (result.straightened) {
          pushNotice({
            level: 'info',
            message: `${photo.fileName}: 台紙の向きに合わせて起こしました。`,
          })
        } else if (result.turned) {
          pushNotice({
            level: 'info',
            message: `${photo.fileName}: 絵が縦向きだったので、横向きに直して泳がせました。`,
          })
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
          // 取り込んだ時点のテーマを絵に記録する。あとでテーマを変えても、
          // その会期の絵だけを出せるようにするため。
          theme: current.theme,
          rig: result.rig,
          species: result.species,
          head: result.head,
          fit: result.fit,
        })
        setPieces((current) => [...current, piece])
      })
    })
  }, [pushNotice])

  // 運営者しか使わない画面なので、ボタンを常設せずキーで開く。
  // 常設すると大画面に管理用の要素が映り込み、来場者の視界に入る。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 's' || event.key === 'S') {
        // 開くたびに先頭へ戻す。前回たくさん送った状態のまま開くと、
        // 開いた瞬間にその枚数を描くことになり、固まる理由が残る。
        setShown(GALLERY_PAGE_SIZE)
        setPanelOpen((open) => !open)
      }
      if (event.key === 'f' || event.key === 'F') void window.aquarium.toggleFullscreen()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // いま選んでいるテーマの絵だけを出す。恐竜の会期に魚が混ざるのを防ぐ。
  const forTheme = settings ? pieces.filter((piece) => themeOf(piece) === settings.theme) : []
  const visible = settings ? forTheme.slice(-settings.maxVisible) : []
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
      <Aquarium
        pieces={visible}
        theme={settings?.theme ?? 'aquarium'}
        sceneryStrength={settings?.sceneryStrength ?? 1}
        decorDensity={settings?.decorDensity ?? 2}
        swayStrength={settings?.swayStrength ?? 1}
        sizeScale={settings?.sizeScale ?? 1}
      />

      {settings && settings.watchFolder !== null && forTheme.length === 0 && pieces.length > 0 && (
        <div className="setup">
          <h1>このテーマの絵はまだありません</h1>
          <p>
            ほかのテーマに {pieces.length} 枚あります。絵はテーマごとに分かれているので、
            <br />
            このテーマの絵は、このテーマを選んだ状態で写真を入れると増えます。
            <br />
            テーマは <strong>S</strong> キーの設定画面で切り替えられます。
          </p>
        </div>
      )}

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
              <span>テーマ</span>
              {THEMES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  disabled={!entry.ready}
                  aria-pressed={settings.theme === entry.id}
                  className={settings.theme === entry.id ? 'chosen' : undefined}
                  onClick={() =>
                    void window.aquarium
                      .updateSettings({ theme: entry.id as ThemeId })
                      .then(setSettings)
                  }
                >
                  {entry.name}
                  {entry.ready ? '' : '（準備中）'}
                </button>
              ))}
            </div>
            <p className="note">
              テーマを変えると、そのテーマで取り込んだ絵だけが出ます。
              いま {forTheme.length} 枚がこのテーマの絵です。
            </p>
          </section>

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
            {storage && (
              <>
                <div className="row">
                  <span>絵の保存先</span>
                  <code>{storage.dataRoot}</code>
                </div>
                <p className="note">
                  {storage.portable
                    ? 'この版は「持ち運び版」です。exe の隣のフォルダに絵が入るので、'
                    : 'この版は「インストール版」です。絵はこのPCの中に入るので、'}
                  別のPCへ移すときは、
                  {storage.portable
                    ? 'フォルダごとコピーすれば絵もそのまま移せます。'
                    : '上のフォルダを丸ごとコピーして、移した先の同じ場所に置いてください。'}
                  <br />
                  取り込みフォルダの写真さえ残っていれば、入れ直すだけでもやり直せます。
                </p>
              </>
            )}

            {/*
              更新の確認。押したときだけ外へ通信する。
              会期中は誰も押さないので、これまでどおりオフラインで動く。
            */}
            <div className="row">
              <span>アプリの更新</span>
              <button
                type="button"
                disabled={updating}
                onClick={async () => {
                  setUpdating(true)
                  setUpdate(null)
                  setUpdate(await window.aquarium.checkForUpdate())
                  setUpdating(false)
                }}
              >
                {updating ? '確認中…' : '更新を確認'}
              </button>
              {update?.kind === 'available' && (
                <button
                  type="button"
                  disabled={updating}
                  onClick={async () => {
                    setUpdating(true)
                    setUpdate(await window.aquarium.installUpdate())
                    setUpdating(false)
                  }}
                >
                  新しい版 {update.version} を入れる
                </button>
              )}
            </div>
            {update && (
              <p className="note">
                {update.kind === 'latest' && `いまが最新です（${update.version}）。`}
                {update.kind === 'available' &&
                  `新しい版 ${update.version} があります。押すと落として入れ替えます。`}
                {update.kind === 'downloaded' &&
                  '落とし終えました。アプリを閉じると入れ替わります。会期中なら、終わってから閉じてください。'}
                {(update.kind === 'portable' || update.kind === 'unavailable') && update.message}
              </p>
            )}
          </section>

          <section>
            <label>
              <input
                type="checkbox"
                checked={settings.cutout.auto !== false}
                onChange={(event) => void patchCutout({ auto: event.target.checked })}
              />
              明るさを写真ごとに自動で合わせる
            </label>
            <p className="note">
              紙や照明が変わるたびに、合う明るさも変わります。自動にしておくと、
              1枚ごとに何通りか試して、いちばん安定して絵が残る値を選びます。
              ふだんは自動のままにしてください。
              下のつまみは、自動を切ったときだけ使われます。
            </p>

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
              自動を切ったときの値です。絵が消えすぎるときは上げ、紙の白が残るときは下げてください。
              変更は次に取り込む写真から効きます。
            </p>
          </section>

          <section>
            <label>
              同時に泳ぐ数: {settings.maxVisible} 匹
              <input
                type="range"
                min="10"
                max="80"
                step="5"
                value={settings.maxVisible}
                onChange={(event) =>
                  void window.aquarium
                    .updateSettings({ maxVisible: Number(event.target.value) })
                    .then(setSettings)
                }
              />
            </label>
            <p className="note">
              動きがカクつくときは減らしてください。描画の重さは枚数にほぼ比例します。
              減らしても絵は消えません。画面に出るのが新しい順の指定数までになるだけです。
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
            <label>
              絵の大きさ: {settings.sizeScale.toFixed(1)} 倍
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={settings.sizeScale}
                onChange={(event) =>
                  void window.aquarium
                    .updateSettings({ sizeScale: Number(event.target.value) })
                    .then(setSettings)
                }
              />
            </label>
            <p className="note">
              画面の大きさに対する倍率です。大きくすると遠くからでも見つけやすくなりますが、
              絵どうしが重なりやすくなります。会場の画面と、来場者が立つ距離で決めてください。
              変えると絵が置き直されるので、いちど散らばります。
            </p>

            <label>
              ひれの動き: {settings.swayStrength.toFixed(1)}
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={settings.swayStrength}
                onChange={(event) =>
                  void window.aquarium
                    .updateSettings({ swayStrength: Number(event.target.value) })
                    .then(setSettings)
                }
              />
            </label>
            <p className="note">
              絵が魚のようにしなります。0 にすると完全に止まります。
              動きがカクつくときは、まずここを 0 にしてください。
              1枚あたりの描画が増えるので、「背景の強さ」より先に効くことがあります。
            </p>

            <label>
              飾りの多さ: {settings.decorDensity.toFixed(1)} 倍
              <input
                type="range"
                min="0.4"
                max="2.4"
                step="0.2"
                value={settings.decorDensity}
                onChange={(event) =>
                  void window.aquarium
                    .updateSettings({ decorDensity: Number(event.target.value) })
                    .then(setSettings)
                }
              />
            </label>
            <p className="note">
              サンゴ・岩・貝の数です。増やすほど賑やかになりますが、
              絵を見つけにくくなります。飾りは画面の下にだけ増えます。
            </p>

            <p className="note">
              光の筋や泡が絵より目立つときは下げてください。0 にすると無地になります。
              こちらは動かした瞬間に反映されます。
            </p>
          </section>

          <section className="pieces">
            {pieces.length === 0 && <p className="note">まだ 1 枚も取り込んでいません。</p>}
            {galleryPage(pieces, shown).items.map((piece) => (
              <figure key={piece.id}>
                <img src={`aqua://piece/${piece.id}`} alt={piece.fileName} />
                <figcaption>{piece.fileName}</figcaption>
                <button type="button" onClick={() => void handleDelete(piece.id)}>
                  消す
                </button>
              </figure>
            ))}
          </section>

          {galleryPage(pieces, shown).remaining > 0 && (
            <div className="row">
              <span>
                {galleryPage(pieces, shown).items.length} / {pieces.length} 枚を表示中
              </span>
              <button type="button" onClick={() => setShown((count) => count + GALLERY_PAGE_SIZE)}>
                さらに {GALLERY_PAGE_SIZE} 枚
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
