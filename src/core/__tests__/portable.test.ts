import { describe, expect, it } from 'vitest'
import { PORTABLE_DATA_FOLDER, portableBaseDir } from '../portable'

describe('portableBaseDir', () => {
  it('環境変数が無ければ null（＝インストール版として AppData に置く）', () => {
    expect(portableBaseDir({})).toBeNull()
  })

  it('exe の置き場所が入っていればそれを返す', () => {
    expect(portableBaseDir({ PORTABLE_EXECUTABLE_DIR: 'E:\\お絵かき水族館' })).toBe(
      'E:\\お絵かき水族館',
    )
  })

  it('前後の空白は落とす（パスの結合で二重区切りになるのを防ぐ）', () => {
    expect(portableBaseDir({ PORTABLE_EXECUTABLE_DIR: '  E:\\aqua  ' })).toBe('E:\\aqua')
  })

  it('空文字や空白だけなら null。カレントディレクトリにデータを作らせない', () => {
    expect(portableBaseDir({ PORTABLE_EXECUTABLE_DIR: '' })).toBeNull()
    expect(portableBaseDir({ PORTABLE_EXECUTABLE_DIR: '   ' })).toBeNull()
  })

  it('データフォルダ名に空白や日本語を入れない（パスの取り回しで事故るため）', () => {
    expect(PORTABLE_DATA_FOLDER).toMatch(/^[A-Za-z0-9-]+$/)
  })
})
