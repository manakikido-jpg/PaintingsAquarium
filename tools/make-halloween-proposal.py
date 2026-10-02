#!/usr/bin/env python3
"""ハロウィンの企画書（HTML）を組み立てる。

**体裁は通年版（`docs/企画書.html`）から借りる。**
見た目を2つ別々に育てると必ずずれるので、CSS はあちらから読み出して
**色だけ**差し替える（海の青 → 夜の紫）。文章の原本は
`docs/企画書-ハロウィン.md` のほうで、ここはその清書版を作るだけ。

画像は data URI で埋め込む。`file://` から開いても画像が出ないと、
PDF 化のときに白い枠だけが残るため。

使い方:
    python3 tools/make-halloween-proposal.py
    python3 tools/make-proposal-pdf.py --halloween
"""
import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = ROOT / 'docs' / '企画書.html'
OUT = ROOT / 'docs' / '企画書-ハロウィン.html'

# 海の青を夜の紫へ。変数名はそのまま使う（CSS を書き換えずに済む）
PALETTE_LIGHT = {
    '--paper': '#FBF9FD', '--surface': '#FFFFFF',
    '--ink': '#201A2E', '--ink-soft': '#5B5270', '--line': '#E4DEEC',
    '--sea': '#7A3FB5', '--sea-deep': '#5A2A8C', '--sea-wash': '#F3EDFA',
    '--coral': '#E8653F', '--sun': '#E9A22B', '--reed': '#2F9E7A', '--grape': '#6E56C8',
}
PALETTE_DARK = {
    '--paper': '#141021', '--surface': '#1E182E',
    '--ink': '#EDE8F5', '--ink-soft': '#B2A8C4', '--line': '#352C47',
    '--sea': '#B98CE6', '--sea-deep': '#CBAAF0', '--sea-wash': '#241C38',
    '--coral': '#FF8E6B', '--sun': '#F5BE5C', '--reed': '#5BC8A5', '--grape': '#A491E8',
}


def data_uri(path: pathlib.Path) -> str:
    kind = 'jpeg' if path.suffix.lower() in ('.jpg', '.jpeg') else path.suffix.lstrip('.')
    return f'data:image/{kind};base64,' + base64.b64encode(path.read_bytes()).decode()


def recolor(css: str) -> str:
    """`:root` の並びごとに色を差し替える。宣言の順番は変えない。"""
    blocks = list(re.finditer(r'(:root[^{]*\{)([^}]*)(\})', css))
    for block in reversed(blocks):
        head, body, tail = block.groups()
        dark = 'dark' in head
        table = PALETTE_DARK if dark else PALETTE_LIGHT
        for name, value in table.items():
            body = re.sub(rf'(\s{re.escape(name)}\s*:\s*)[^;]+;', rf'\g<1>{value};', body)
        css = css[:block.start()] + head + body + tail + css[block.end():]
    return css


def image(path: str, alt: str, caption: str) -> str:
    return (f'    <figure>\n      <img src="{data_uri(ROOT / "docs" / path)}" alt="{alt}">\n'
            f'      <figcaption>{caption}</figcaption>\n    </figure>')


def main() -> None:
    style = re.search(r'<style>(.*?)</style>', BASE.read_text(encoding='utf-8'), re.S)
    if not style:
        raise SystemExit('docs/企画書.html に <style> が見つかりません')
    css = recolor(style.group(1))

    body = f'''
<div class="sheet">
  <header class="masthead">
    <div class="eyebrow"><span class="slot">〈会場名〉</span> ご担当者さま ／ 10月の期間限定ワークショップのご提案</div>
    <h1>お絵かきハロウィン</h1>
    <p class="lead">子どもが塗ったおばけが、その場で大画面の夜空をふわふわ漂い出します。</p>
    <div class="meta">
      <span>開催希望日 <b class="slot">〈2026年10月◯日（◯）〜◯日（◯）〉</b></span>
      <span>実施時間 <b class="slot">〈10:00〜16:00〉</b></span>
      <span>ご提案 <b class="slot">〈氏名／連絡先〉</b></span>
    </div>
  </header>

  <section style="margin-top:36px">
    <p>塗り終わった紙をスキャナに通すだけで、<strong>約3秒後</strong>にその絵が画面の中で動き始めます。自分の絵を探して、指をさして、親を呼ぶ。<mark>この瞬間を作るための企画</mark>です。</p>
    <p>塗り絵なので<strong>絵が苦手な子でも参加できます</strong>。塗った紙は持ち帰れます。通年で実施している「お絵かき水族館」「お絵かきダイナソー」に、<strong>季節を乗せた10月だけの版</strong>です。</p>

    <div class="callout">
      <p><strong>会場にお借りするのは「場所」だけです。</strong>机・椅子・モニター・機材・画材まで、すべてこちらで持ち込みます。</p>
      <ul class="checks">
        <li>インターネット不要（Wi-Fi も不要）</li>
        <li>音が出ません</li>
        <li>個人情報を集めません</li>
        <li>撤収後に跡が残りません</li>
      </ul>
    </div>
  </section>

  <section>
    <h2>なぜハロウィンなのか</h2>
    <div class="qa">
      <div><dt>会場の装飾と地続きになる</dt><dd>10月の売場はすでにハロウィンの飾りで作られています。そこへ<b>同じ世界観のモニター</b>が置かれると、催事が売場から浮きません。</dd></div>
      <div><dt>仮装と相性がよい</dt><dd>仮装して来た子が、自分の塗ったおばけと一緒に写真を撮れます。通年版には無い「<b>今日ここに来た理由</b>」が1つ増えます。</dd></div>
      <div><dt>期間が決まっているから来る理由になる</dt><dd>「いつでもできる」ではなく<b>10月だけ</b>です。告知の文言が、そのまま集客の理由になります。</dd></div>
      <div><dt>夜の画面が売場で目立つ</dt><dd>水族館の青・恐竜の空に対し、ハロウィンは<b>暗い夜空に満月</b>です。明るい売場の中でモニターが際立ちます。</dd></div>
    </div>
{image('images/画面-ハロウィン-開発中.jpg', 'ハロウィンの画面。紫の夜空に満月、下に墓地とかぼちゃ畑',
       '実際に動かしたハロウィンの画面です。浮いている5つは台紙をそのまま取り込んだもので、会場では<b>これが子どもの塗った色</b>になります。')}
  </section>

  <section>
    <h2>実施実績</h2>
    <p><strong>すでに2会場で、のべ630人のお子さまに参加いただいています。</strong></p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>会場</th><th>実施期間</th><th class="num">参加人数</th></tr></thead>
        <tbody>
          <tr><td>イオン久御山店</td><td>2日間</td><td class="num"><strong>420人</strong></td></tr>
          <tr><td>イオン大日店</td><td>2日間</td><td class="num"><strong>210人</strong></td></tr>
          <tr><td><strong>合計</strong></td><td><strong>4日間</strong></td><td class="num"><strong>630人</strong></td></tr>
        </tbody>
      </table>
    </div>
    <div class="callout">
      <p><strong>この実績は「お絵かき水族館」「お絵かきダイナソー」でのものです。ハロウィンはまだ実施していません。</strong>ただし<b>仕組みは同じもの</b>で、変わるのは台紙と画面の世界だけです。4日間・630人を通した運用と、そこで見つかった不具合の修正は、そのままハロウィンにも効いています。</p>
    </div>
    <ul class="checks" style="margin-top:18px">
      <li>来場層は<strong>ファミリーが中心</strong>。未就学児〜小学生とその保護者に受け入れられています</li>
      <li>体験の終わりに<strong>アンケートへ案内する導線もスムーズ</strong>でした</li>
      <li>運用中に見つかった不具合は、<strong>実際に集まった紙・写真データを使って検証</strong>し、その都度直しています</li>
    </ul>
{image('images/いろいろな絵.jpg', '実際に会場で塗られた絵の一部',
       '通年版で実際に会場で塗られた絵です（すべて実物）。ハロウィンでも同じように、<b>塗った色のまま</b>動きます。')}
  </section>

  <section>
    <h2>来場者の体験</h2>
    <p>大きなモニターの中に、<strong>満月の出ている紫の夜空</strong>が広がっています。下のほうには枯れ木・墓石・かぼちゃ畑があり、霧が流れています。その中を、<strong>子どもたちが塗ったおばけたち</strong>がふわふわ漂っています。1つずつ、みんな違う色です。</p>
    <p>子どもは机で台紙を塗り、塗り終わったらスタッフに渡します。スタッフが紙をスキャナに通すと、<strong>約3秒後</strong>、いま塗ったばかりの絵が夜空にふわっと現れて漂い始めます。</p>
    <p>ここで必ず起きるのが「<strong>あっ、わたしの！</strong>」です。子どもは画面に駆け寄って自分の絵を指さし、親を呼びます。親はスマホを構えます。<mark>この10秒のために全部を作っています。</mark></p>

    <h3>塗れるのは5種類です</h3>
{image('images/ハロウィン台紙5種.jpg', 'ハロウィンの台紙5種。かぼちゃ・こうもり・おばけ・まじょ・フランケンシュタイン',
       'かぼちゃ・こうもり・おばけ・まじょ・フランケンシュタインの5種です。')}
    <div class="table-wrap">
      <table>
        <thead><tr><th>台紙</th><th>動き</th></tr></thead>
        <tbody>
          <tr><td><strong>かぼちゃ</strong></td><td>夜空をゆっくり上下に漂う</td></tr>
          <tr><td><strong>おばけ</strong></td><td>ふわふわと、いちばんゆっくり漂う</td></tr>
          <tr><td><strong>こうもり</strong></td><td>翼を広げて、左右へすいっと進む</td></tr>
          <tr><td><strong>まじょ</strong></td><td>ほうきに乗って夜空を横切る</td></tr>
          <tr><td><strong>フランケンシュタイン</strong></td><td>手を広げたまま、ゆったり漂う</td></tr>
        </tbody>
      </table>
    </div>

    <h3>流れ（1人あたり 5〜10分）</h3>
    <ol class="steps">
      <li><span class="what">台紙を選ぶ（5種）</span><span class="time">30秒</span><span class="aim">「選ぶ」という行為で、自分のものになります</span></li>
      <li><span class="what">好きな色で塗る</span><span class="time">3〜7分</span><span class="aim">塗るだけなので失敗しません。絵が苦手でも参加できます</span></li>
      <li><span class="what">スタッフに渡す → スキャン</span><span class="time">20秒</span><span class="aim">待たせません。機械の操作は見せません</span></li>
      <li><span class="what">画面に自分の絵が現れる</span><span class="time">1〜3分</span><span class="aim">「自分がやったことが、大きな画面を変えた」</span></li>
      <li><span class="what">塗った紙を持ち帰る</span><span class="time">—</span><span class="aim">家でもう一度、話題になります</span></li>
    </ol>

    <h3>なぜこの形にしているか</h3>
    <div class="qa">
      <div><dt>塗り絵にした理由</dt><dd>白紙に「おばけを描いて」と言うと、描ける子と描けない子が分かれます。台紙なら<b>全員が同じスタートライン</b>に立てて、しかも必ずそのおばけに見えたまま動きます。</dd></div>
      <div><dt>3秒にこだわる理由</dt><dd>「あとで映ります」では、自分がやったこととの因果が切れます。<b>その場で動き出す</b>から、驚きと達成感になります。</dd></div>
      <div><dt>絵を直さない</dt><dd>はみ出した色も塗り残しも、そのまま動きます。きれいに直すと<b>「自分の絵」ではなくなる</b>からです。</dd></div>
      <div><dt>5種とも「浮く」で揃えた</dt><dd>歩く絵と浮く絵を混ぜると、見分けを1つ間違えただけで「地面を歩くはずのものが空に浮く」事故になります。ハロウィンは題材そのものが空に合うので、<b>混ぜない設計</b>にしました。</dd></div>
      <div><dt>怖くしない</dt><dd>台紙はどれも笑っている顔です。血も牙も描いていません。画面も<b>真っ黒にせず</b>、紫の夜空と満月にしています。小さい子が怖がると、保護者ごと離れてしまうからです。</dd></div>
      <div><dt>同時に動くのは50匹まで</dt><dd>増え続けると自分の絵を見失います。古い絵は消えるのではなく、<b>画面の外へ去ります</b>。</dd></div>
    </div>

    <h3>混雑したとき</h3>
    <ul class="checks">
      <li>塗る席は<strong>6席</strong>。1時間あたり<strong>30〜50人</strong>が目安です（塗り時間5分想定）</li>
      <li>塗るのに時間がかかっても、<strong>待ち行列はスキャンの20秒だけ</strong>です。機械の前には並びません</li>
      <li>台紙は持ち帰って<strong>あとから塗って戻ってきてもらう</strong>こともできます</li>
    </ul>
  </section>

  <section>
    <h2>会場側の心配ごとへの回答</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>ご心配</th><th>回答</th></tr></thead>
        <tbody>
          <tr><td>ネットワークを使いますか</td><td><strong>使いません。</strong> 会場のWi-Fiも有線も不要です</td></tr>
          <tr><td>音は出ますか</td><td><strong>出しません。</strong> 静かな展示です</td></tr>
          <tr><td>個人情報を集めますか</td><td><strong>集めません。</strong> 名前も写真も年齢もいただきません</td></tr>
          <tr><td>絵は誰かに公開されますか</td><td><strong>しません。</strong> その場のモニターに映るだけで、外部には一切送りません</td></tr>
          <tr><td>怖い絵になりませんか</td><td><strong>なりません。</strong> 台紙は5種とも笑っている顔です。画面も真っ黒にせず、紫の夜空と満月にしています</td></tr>
          <tr><td>机や椅子はお借りできますか</td><td><strong>不要です。</strong> こちらで持ち込みます</td></tr>
          <tr><td>モニターは用意が必要ですか</td><td><strong>不要です。</strong> こちらで持ち込みます</td></tr>
          <tr><td>汚れませんか</td><td>クレヨン・色鉛筆のみです。机はこちらの持ち込みで、<strong>養生シートを敷きます</strong></td></tr>
          <tr><td>子どもが機械を触りませんか</td><td>機材は机の奥に置きます。<strong>操作するのはスタッフだけ</strong>です</td></tr>
          <tr><td>途中で止まりませんか</td><td>万一PCが止まっても、<strong>再起動すればそれまでの絵は全部残ります</strong></td></tr>
          <tr><td>大人数でも大丈夫ですか</td><td><strong>実績があります。</strong> イオン久御山店では2日間で420人にご参加いただきました</td></tr>
          <tr><td>片付けは</td><td>持ち込んだものを全部引き上げ、ゴミも持ち帰ります。<strong>跡は残りません</strong></td></tr>
          <tr><td>費用の負担は</td><td><strong>ありません。</strong> お借りするのは場所（と、可能であれば電源1口）だけです</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>開催時期について</h2>
    <p>ハロウィンは<strong>期間が決まっていること自体が強み</strong>ですが、裏返すと日程がずれると効果が落ちます。</p>
    <ul class="checks">
      <li>おすすめは<strong>10月中旬〜10月31日</strong>です。売場の装飾が立ち上がったあとで、かつ当日までの期間に当たります</li>
      <li><strong>土日</strong>を含めていただけると、ファミリーの来場が集中します</li>
      <li>11月に入ると季節物として弱くなります。その場合は<strong>通年版（水族館・恐竜）</strong>での実施をご提案します</li>
    </ul>
  </section>

  <section>
    <h2>現在の状態（正直に）</h2>
    <p><strong>ハロウィンはまだ実施していません。</strong> いまの進み具合をそのまま書きます。</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>項目</th><th>状態</th></tr></thead>
        <tbody>
          <tr><td>仕組み（スキャン・切り抜き・動き）</td><td><strong>完成</strong>。2会場・4日間・630人で運用済み</td></tr>
          <tr><td>ハロウィンの画面（夜空・月・墓地・霧）</td><td><strong>完成</strong>。実機で動かして確認済み</td></tr>
          <tr><td>台紙5種</td><td><strong>作成中</strong>。5種が互いに見分けられることは測定済み。線画を仕上げている段階</td></tr>
          <tr><td>台紙の印刷用PDF</td><td>未着手（線画の確定後すぐ作れます）</td></tr>
          <tr><td>会場での実施</td><td><strong>未実施</strong></td></tr>
        </tbody>
      </table>
    </div>
    <ul class="checks" style="margin-top:18px">
      <li>仕組みそのものは通年版と同じものです。<strong>新しく作るのは台紙と画面だけ</strong>なので、未知の部分は多くありません</li>
      <li>台紙は「<strong>5種が互いに似ていないこと</strong>」を実際に測ってから印刷します。形が似ていると別の生き物として判定され、動き方がちぐはぐになるためです</li>
      <li>ご発注いただける場合、<strong>台紙の確定から印刷まで数日</strong>を見込んでいます</li>
    </ul>
  </section>

  <section>
    <h2>ご相談したいこと</h2>
    <ol class="steps">
      <li><span class="what">実施日</span><span class="aim">10月中旬〜31日のうち、土日を含む日程をいただけると助かります</span></li>
      <li><span class="what">設置場所</span><span class="aim">人の流れの中か、少し外れた落ち着ける場所か</span></li>
      <li><span class="what">電源</span><span class="aim">コンセントを1口お借りできるか。難しければポータブル電源を持ち込みます</span></li>
      <li><span class="what">想定来場者数</span><span class="aim">台紙の枚数を決めるために伺いたいです（実績は1日あたり105〜210人）</span></li>
      <li><span class="what">搬入・搬出</span><span class="aim">当日の経路と時間。台車が使えるかどうかも伺えると助かります</span></li>
      <li><span class="what">会場の装飾との兼ね合い</span><span class="aim">並べて置けるか、色味を合わせる必要があるか</span></li>
    </ol>
  </section>
</div>
'''

    OUT.write_text(
        '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
        '<title>お絵かきハロウィン 企画書</title>\n'
        f'<style>{css}</style>\n</head>\n<body>{body}</body>\n</html>\n',
        encoding='utf-8')
    print(f'{OUT}  {OUT.stat().st_size / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
