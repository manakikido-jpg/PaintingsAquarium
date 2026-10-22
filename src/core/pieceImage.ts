import type { Piece } from '../shared/types'

/** 保存画像が変わったときだけURLを替える。位置や向きの更新では画像を読み直さない。 */
export function pieceImageUrl(piece: Pick<Piece, 'id' | 'imageRevision'>): string {
  return `aqua://piece/${encodeURIComponent(piece.id)}?revision=${piece.imageRevision ?? 0}`
}
