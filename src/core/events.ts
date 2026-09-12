/**
 * イベント（会期）ごとに絵を分けて残すための名前づけ。
 *
 * **なぜ要るのか**
 *
 * 絵は 1 か所にたまり続ける。会期を 2 回・3 回とやると、
 * 「どのイベントの絵か」が混ざって分からなくなる。
 * 当面はイベントごとの絵を残しておきたい（本人）ので、
 * 会期の終わりに**その回ぶんをまとめて別のフォルダへ移す**。
 *
 * **消さずに移す。** 捨ててよいかどうかは、あとから見て決められる。
 * 会期中の絵は二度と撮り直せないので、こちら側で消す判断はしない。
 *
 * 名前づけをここに切り出したのは、Windows のフォルダ名に使えない字が
 * あるため。会場で入れる名前（「イオン久御山店」など）をそのまま使うと、
 * 記号ひとつで保存に失敗して**会期ぶんの絵を移せなくなる**。
 */

/** Windows がフォルダ名に使えない字。`:` は「イオン:2日目」のような入力で普通に出る */
const FORBIDDEN = /[\\/:*?"<>|]/g

/** 制御文字。コピー&ペーストで紛れ込むことがある */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x1f\x7f]/g

/**
 * フォルダ名の長さの上限（文字数）。
 *
 * Windows の 1 つぶんの上限は 255 文字だが、この下に絵が何百枚も入る。
 * 深い場所へ置かれても行き詰まらないよう、名前のほうは短く抑える。
 */
const MAX_NAME = 40

function twoDigits(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** `2026-09-12` の形。並べたときに日付順になるので、頭に付ける。 */
export function dateStamp(when: Date): string {
  return `${when.getFullYear()}-${twoDigits(when.getMonth() + 1)}-${twoDigits(when.getDate())}`
}

/**
 * 入力された名前を、フォルダ名に使える形へ直す。
 *
 * **落とすのではなく置き換える。** 「イオン久御山店/2日目」を
 * 「イオン久御山店2日目」にすると、あとで見て別のものと見分けが付かない。
 * `-` に替えれば、区切りがあったことは残る。
 */
export function safeName(name: string): string {
  const cleaned = name
    .replace(FORBIDDEN, '-')
    .replace(CONTROL, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Windows は末尾の `.` と空白を黙って落とす。先に落としておく
    .replace(/[.\s]+$/, '')
  return cleaned.slice(0, MAX_NAME)
}

/**
 * 会期ぶんの絵を入れるフォルダ名を決める。
 *
 * **必ず日付から始める。** 名前を空にされても成立し、並べれば時系列になる。
 * `CON` `NUL` のような Windows の予約語も、日付が前に付くので当たらない。
 *
 * 同じ日に 2 回終えたときは `-2`、`-3` と足す。**上書きはしない。**
 * 上書きすると、1 回目の絵が黙って消える。
 */
export function eventFolderName(
  name: string,
  when: Date,
  exists: (folder: string) => boolean,
): string {
  const label = safeName(name)
  const base = label ? `${dateStamp(when)} ${label}` : dateStamp(when)
  if (!exists(base)) return base
  for (let index = 2; index < 1000; index++) {
    const candidate = `${base}-${index}`
    if (!exists(candidate)) return candidate
  }
  // ここまで来ることは実際には無いが、返さないと絵を移せない
  return `${base}-${Date.now()}`
}
