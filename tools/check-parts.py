#!/usr/bin/env python3
"""
切って動かしている線が**本当に切ってよい線か**を、台紙ごとに全部測る。

    python3 tools/check-parts.py

`check-cut.py` は「どこかに切れる線があるか」を探す道具。
こちらは「**いま実装が使っている線**」を測る。

見つけた失敗（R-048）:
  切れる線を探す道具はあったのに、**実装が使っている線そのもの**を
  測る道具が無かった。サメの胸びれの箱が胴の真ん中に当たって
  動かすたびに胴が裂けていたのに、気づけなかった。

**「線が絵を横切る割合」では測らない。**
四足恐竜の足は、わざと腰より上まで箱を伸ばして（`HIP_OVERLAP`）
軸のすぐそばで胴と重ねている。軸のそばは回してもほとんど動かないので、
そこを横切っていても裂けない。最初にそれで測ったら**全部が失格**になった。

見るのは**開く隙間の大きさ**。切り目の上で絵が乗っている点が、
回したときに軸からの距離だけずれる。その最大値を絵の高さに対する割合で出す。

ひれ（背びれ・胸びれ）は台紙ではなく**取り込んだ絵ごとに測って**決まるので、
台紙だけ見ても確かめられない。取り込み済みの絵を渡すと、そちらも測る。

    python3 tools/check-parts.py <userData>/data/pieces.json

数字（切る位置・振れ角）は `src/core/templates.ts` と `src/core/undulate.ts`
から読む。手で写すと、片方だけ直したときに黙って食い違う。
"""
import importlib.util
import re
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location('check_cut', Path(__file__).parent / 'check-cut.py')
_cc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_cc)

# 目に見える隙間の上限（絵の高さに対する割合）。
#
# **仮の値。** 実機で見えた／見えなかった例からの線引きで、
#   見えた  四足恐竜の足の切り目 3.1〜4.5%（会場から「足が避けている」）
#   見えない ウミガメのひれ 0.9〜1.7%（指摘なし・録画でも段差なし）
# この間のどこかにある。3% は安全側に寄せて置いた。
# もっと確かな例が出たら、その実測で置き直すこと。
GAP_LIMIT = 0.03

# 尾びれだけは別の上限。
#
# 尾は**胴を全部描いた上に重ねて**描く（`Aquarium.tsx`）。ずれても下に絵があるので
# 穴は開かず、付け根に段差が出るだけ。ひれや足の箱は下に何も無いので、
# ずれた分がそのまま背景の色になる。同じずれでも見え方が違う。
#
# まる魚とサメの尾は 3.1%。実機で拡大して見たが、段差は分からなかった
#（`chk4` の捕捉画像）。上限はその少し上に置いてある。
# これを超える台紙が出たら、目で見て確かめてから通すこと。
TAIL_GAP_LIMIT = 0.04

TEMPLATES = {
    'fish': 'assets/templates/01_sakana_A_marusakana.png',
    'tako': 'assets/templates/03_tako.png',
    'iruka': 'assets/templates/04_iruka.png',
    'same': 'assets/templates/05_same.png',
    'kurage': 'assets/templates/06_kurage.png',
    'umigame': 'assets/templates/07_umigame.png',
    'pteranodon': 'assets/templates/dinosaur/11_pteranodon.png',
    'ankylosaurus': 'assets/templates/dinosaur/12_ankylosaurus.png',
    'brontosaurus': 'assets/templates/dinosaur/13_brontosaurus.png',
    'stegosaurus': 'assets/templates/dinosaur/14_stegosaurus.png',
    'triceratops': 'assets/templates/dinosaur/15_triceratops.png',
}


def number(text: str, name: str) -> float:
    found = re.search(rf'^(?:export )?const {name} = ([\d.]+)$', text, re.M)
    if not found:
        raise SystemExit(f'{name} が見つからない')
    return float(found.group(1))


def tail_cuts(text: str) -> dict[str, tuple[float, float]]:
    block = re.search(r'const TEMPLATE_RIG[^{]*\{(.*?)\n\}', text, re.S).group(1)
    return {
        species: (float(a), float(b))
        for species, a, b in re.findall(r'^  (\w+): \{ tailFrom: ([\d.]+), tailY: ([\d.]+) \}', block, re.M)
    }


def walker_cuts(text: str) -> dict[str, tuple[float, list[float], list[float]]]:
    """四足恐竜を足の組に切っていたときの切り目。

    いまは切っていないので、普通は何も見つからない。
    切る作りへ戻したときに、ここが測り直してくれる。
    """
    out = {}
    for species, hip, a, b, c, d in re.findall(
        r'^  (\w+): walkerParts\(([\d.]+), \[([\d.]+), ([\d.]+)\], \[([\d.]+), ([\d.]+)\]\),', text, re.M
    ):
        out[species] = (float(hip), [float(a), float(b)], [float(c), float(d)])
    return out


def gap_on_column(filled, aspect, x, span, pivot, angle):
    """縦の切り目 x（y は span の範囲）で開く隙間。絵の高さに対する割合。"""
    height, width = filled.shape
    column = min(width - 1, max(0, int(round(x * width))))
    y0 = min(height - 1, max(0, int(round(span[0] * height))))
    y1 = min(height, max(y0 + 1, int(round(span[1] * height))))
    rows = np.nonzero(filled[y0:y1, column])[0]
    if rows.size == 0:
        return 0.0
    ys = (rows + y0) / height
    dx = (x - pivot[0]) * aspect
    dy = ys - pivot[1]
    return float(np.max(np.hypot(dx, dy))) * abs(angle)


def gap_on_row(filled, aspect, y, span, pivot, angle):
    """横の切り目 y（x は span の範囲）で開く隙間。"""
    height, width = filled.shape
    row = min(height - 1, max(0, int(round(y * height))))
    x0 = min(width - 1, max(0, int(round(span[0] * width))))
    x1 = min(width, max(x0 + 1, int(round(span[1] * width))))
    cols = np.nonzero(filled[row, x0:x1])[0]
    if cols.size == 0:
        return 0.0
    xs = (cols + x0) / width
    dx = (xs - pivot[0]) * aspect
    dy = y - pivot[1]
    return float(np.max(np.hypot(dx, dy))) * abs(angle)


def load_piece(path: Path):
    """取り込んだ絵（透過PNG）を、台紙と同じ「内側」の形にして返す。"""
    from PIL import Image

    image = Image.open(path).convert('RGBA')
    box = image.getbbox()
    if box is None:
        return None, 0, 0
    image = image.crop(box)
    image.thumbnail((800, 800))
    filled = np.asarray(image)[:, :, 3] > 40
    return filled, image.width, image.height


def check_pieces(path: Path, fin_max: float) -> list[tuple]:
    """取り込んだ絵のひれの箱が、絵をどれだけずらすか。"""
    import json

    pieces = json.loads(path.read_text(encoding='utf-8'))
    folder = path.parent / 'pieces'
    over = []
    for piece in pieces:
        rig = piece.get('rig') or {}
        fins = rig.get('fins') or []
        name = f"{piece.get('species') or '台紙不明'}（{piece.get('fileName')}）"
        filled, width, height = load_piece(folder / f"{piece['id']}.png")
        if filled is None:
            print(f'\n{name}  絵が読めない')
            continue
        aspect = width / height
        print(f'\n{name}  {width}x{height}  ひれ {len(fins)} 枚')
        for fin in fins:
            base, side = fin['base'], fin['side']
            span = (0.0, base) if side == 'top' else (base, 1.0)
            pivot = ((fin['from'] + fin['to']) / 2, base)
            gaps = [
                (f"x={fin['from']:.2f}", gap_on_column(filled, aspect, fin['from'], span, pivot, fin_max)),
                (f"x={fin['to']:.2f}", gap_on_column(filled, aspect, fin['to'], span, pivot, fin_max)),
                (f'y={base:.2f}', gap_on_row(filled, aspect, base, (fin['from'], fin['to']), pivot, fin_max)),
            ]
            for at, gap in gaps:
                mark = f'   ← 上限 {GAP_LIMIT * 100:.0f}% を超えている' if gap > GAP_LIMIT else ''
                if gap > GAP_LIMIT:
                    over.append((name, f"ひれ({side})", at, gap))
                print(f"  ひれ({side}) {fin['from']:.2f}〜{fin['to']:.2f}  {at}  隙間 {gap * 100:4.1f}%{mark}")
    return over


def main() -> int:
    templates = (ROOT / 'src/core/templates.ts').read_text(encoding='utf-8')
    undulate = (ROOT / 'src/core/undulate.ts').read_text(encoding='utf-8')

    walkers = walker_cuts(templates)
    hip_overlap = number(templates, 'HIP_OVERLAP') if walkers else 0.0
    leg_swing = number(templates, 'LEG_SWING') if walkers else 0.0
    kame_side = number(templates, 'KAME_SIDE')
    kame_front = number(templates, 'KAME_FRONT')
    kame_back = number(templates, 'KAME_BACK')
    ptera_shoulder = number(templates, 'PTERA_SHOULDER')
    tail_max = number(undulate, 'TAIL_MAX_ANGLE')
    fin_max = number(undulate, 'FIN_MAX_ANGLE')
    head_hold = float(re.search(r'headHold: ([\d.]+)', undulate).group(1))
    kame_swing = 0.13  # KAME_PARTS の swing（表の中の値）

    tails = tail_cuts(templates)
    uncut = set(re.findall(r'^  (\w+): WALKER_PARTS,', templates, re.M))

    worst = 0.0
    over = []
    for name in sys.argv[1:]:
        over.extend(check_pieces(Path(name), fin_max))
    for species, relative in TEMPLATES.items():
        filled, ink, width, height = _cc.load(ROOT / relative)
        if filled is None:
            print(f'{species}: 台紙が読めない（{relative}）')
            return 1
        aspect = width / height
        lines = []

        # 分割（PARTITION）を持つ絵は、そちらの経路で描かれる。
        # 尾のリグは使われないので測らない（`Aquarium.tsx` の limbs / strips の分岐）
        if species in tails and species not in walkers and species not in uncut and species != 'umigame':
            from_ratio, tail_y = tails[species]
            # 頭側の割合をそのまま x に使える（台紙はすべて頭が左）
            past = (from_ratio - head_hold) / (1 - head_hold)
            angle = tail_max * max(0.0, past) ** 2
            cut = max(0.0, from_ratio - 0.03)  # 継ぎ目を隠すため少し頭寄りから切る
            lines.append(
                ('尾の付け根', f'x={cut:.2f}', gap_on_column(filled, aspect, cut, (0, 1), (from_ratio, tail_y), angle))
            )

        if species in walkers:
            hip, front, back = walkers[species]
            top = hip - hip_overlap
            for name, box in (('前足', front), ('後ろ足', back)):
                pivot = ((box[0] + box[1]) / 2, top)
                for edge in box:
                    lines.append(
                        (f'{name}の切り目', f'x={edge:.2f}', gap_on_column(filled, aspect, edge, (top, 1.0), pivot, leg_swing))
                    )
                lines.append((f'{name}の腰', f'y={top:.2f}', gap_on_row(filled, aspect, top, box, pivot, leg_swing)))

        if species == 'umigame':
            for label, edge, span, pivot in (
                ('左前ひれ', kame_side, (0, kame_front), (kame_side, kame_front)),
                ('右前ひれ', 1 - kame_side, (0, kame_front), (1 - kame_side, kame_front)),
                ('左後ろひれ', kame_side, (kame_back, 1.0), (kame_side, kame_back)),
                ('右後ろひれ', 1 - kame_side, (kame_back, 1.0), (1 - kame_side, kame_back)),
            ):
                lines.append((f'{label}の内側', f'x={edge:.2f}', gap_on_column(filled, aspect, edge, span, pivot, kame_swing)))
            for label, y, span, pivot in (
                ('左前ひれ', kame_front, (0, kame_side), (kame_side, kame_front)),
                ('右前ひれ', kame_front, (1 - kame_side, 1.0), (1 - kame_side, kame_front)),
                ('左後ろひれ', kame_back, (0, kame_side), (kame_side, kame_back)),
                ('右後ろひれ', kame_back, (1 - kame_side, 1.0), (1 - kame_side, kame_back)),
            ):
                lines.append((f'{label}の外', f'y={y:.2f}', gap_on_row(filled, aspect, y, span, pivot, kame_swing)))

        print(f'\n{species}  {width}x{height}')
        if species == 'pteranodon':
            print(f'  肩の線  y={ptera_shoulder:.2f}  伸縮なので切り目が動かない。裂けない')
        if not lines:
            if species in uncut:
                print('  絵を切らない（1枚のまま縦に縮めて傾ける）。裂けようがない')
            else:
                print('  回して切る線は無い（帯としなりだけ。裂けようがない）')
            continue
        for label, at, gap in sorted(lines, key=lambda one: -one[2]):
            worst = max(worst, gap)
            limit = TAIL_GAP_LIMIT if label == '尾の付け根' else GAP_LIMIT
            mark = ''
            if gap > limit:
                mark = f'   ← 上限 {limit * 100:.0f}% を超えている'
                over.append((species, label, at, gap))
            print(f'  {label:<14} {at}  隙間 {gap * 100:4.1f}%{mark}')

    print()
    if over:
        print(f'{len(over)} 本が上限を超えている:')
        for species, label, at, gap in over:
            print(f'  {species} の {label}（{at}）  {gap * 100:.1f}%')
        return 1
    print(
        f'すべて上限以内（ひれ・足 {GAP_LIMIT * 100:.0f}% / 尾 {TAIL_GAP_LIMIT * 100:.0f}%）。'
        f'一番大きい隙間は {worst * 100:.1f}%'
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
