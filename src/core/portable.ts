/**
 * ポータブル版（インストールせず、exe をそのまま実行する版）の判定。
 *
 * electron-builder の portable ターゲットは、起動時に exe を置いた場所を
 * 環境変数 `PORTABLE_EXECUTABLE_DIR` に入れる。入っていればポータブル版。
 */

/** ポータブル版のとき、exe の隣に作るデータフォルダ名。 */
export const PORTABLE_DATA_FOLDER = 'PaintingsAquarium-Data'

/**
 * ポータブル版なら exe の置き場所を、そうでなければ `null` を返す。
 *
 * ポータブル版でも保存先を AppData のままにすることはできるが、そうすると
 * **USB を別のPCに挿しても絵が付いてこない**。持ち運べることがポータブル版を
 * 作る唯一の理由なので、保存先も exe と一緒に動かす。
 *
 * 空文字や空白だけの場合を `null` に倒しているのは、そこを基準にすると
 * カレントディレクトリ（＝どこか分からない場所）にデータを作ってしまうため。
 */
export function portableBaseDir(env: Record<string, string | undefined>): string | null {
  const dir = env.PORTABLE_EXECUTABLE_DIR
  if (typeof dir !== 'string') return null
  const trimmed = dir.trim()
  return trimmed.length > 0 ? trimmed : null
}
