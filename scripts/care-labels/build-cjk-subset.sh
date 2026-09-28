#!/usr/bin/env bash
# Сабсеты CJK для составников: NotoSansSC-care.otf (строки `cn`) и NotoSansJP-care.otf (строки `jp`).
#
# Два шага:
#   1. из fiber-translations.json (истина переводов) + базового набора имён волокон собираются
#      cjk-chars-sc.txt и cjk-chars-jp.txt — ПО ЯЗЫКУ: SC-сабсет несёт только знаки китайских
#      строк, JP — только японских. Общий набор на оба нельзя: тогда SC-строка, по ошибке
#      отданная JP-шрифту, отрисовалась бы японской формой и ошибку никто бы не увидел.
#   2. pyftsubset режет исходники Noto Sans CJK (OFL, 16 МБ каждый, в репо НЕ кладутся —
#      откуда брать, в README.md рядом) до этих знаков.
#
# Запуск из корня репо клиента:  scripts/care-labels/build-cjk-subset.sh
# Пути переопределяются: FIBER_JSON, NOTO_SC, NOTO_JP, UV.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PLANS="$REPO/../tmp/plans/care-labels"
FIBER_JSON="${FIBER_JSON:-$PLANS/fiber-translations.json}"
NOTO_SC="${NOTO_SC:-$PLANS/fonts-src/NotoSansCJKsc-Regular.otf}"
NOTO_JP="${NOTO_JP:-$PLANS/fonts-src/NotoSansCJKjp-Regular.otf}"
UV="${UV:-$HOME/.local/bin/uv}"
OUT_CHARS="$REPO/scripts/care-labels"
OUT_FONTS="$REPO/src/fonts"

for f in "$FIBER_JSON" "$NOTO_SC" "$NOTO_JP"; do
  [ -f "$f" ] || { echo "missing: $f" >&2; exit 1; }
done

# Шаг 1. Диапазоны — те же, что у шейпера (text-outline.ts, isCjk): всё прочее рисует FeatureMono.
"$UV" run --quiet python3 - "$FIBER_JSON" "$OUT_CHARS" <<'PY'
import json, sys, pathlib

src, out = sys.argv[1], pathlib.Path(sys.argv[2])
data = json.load(open(src, encoding="utf-8"))

def is_cjk(ch):
    c = ord(ch)
    return 0x3000 <= c <= 0x30FF or 0x4E00 <= c <= 0x9FFF or 0xFF00 <= c <= 0xFFEF

# Базовый набор (§6.2 плана): частые имена волокон, чтобы перевод, введённый в редакторе позже,
# чаще всего уже был покрыт. Плюс немного CJK-пунктуации для тех же ручных переводов.
BASE = {
    "cn": "棉 麻 亚麻 苎麻 羊毛 羊绒 蚕丝 真丝 粘胶 莫代尔 莱赛尔 天丝 聚酯纤维 涤纶 锦纶 尼龙 聚酰胺 "
          "氨纶 腈纶 丙纶 醋酯 铜氨 竹纤维 大麻 皮革 牛皮 羊皮 猪皮 马海毛 驼绒 兔毛 牦牛毛 再生 有机 "
          "金属 塑料 木 角 贝壳",
    "jp": "綿 麻 毛 絹 レーヨン ポリエステル ナイロン ポリウレタン アクリル ポリプロピレン アセテート "
          "キュプラ モダール リヨセル テンセル カシミヤ アルパカ モヘヤ アンゴラ ウール シルク コットン "
          "リネン ラミー ヘンプ 革 牛革 羊革 豚革 合成皮革 人工皮革 金属 指定外繊維 複合繊維 再生繊維 "
          "動物由来 非繊維 部分 含む",
}
PUNCT = "、。・（）％／："

for lang, name in (("cn", "sc"), ("jp", "jp")):
    text = [f["names"][lang] for f in data["fibers"] if f["names"].get(lang)]
    text.append(data["non_textile_animal_phrase"][lang])
    text.append(BASE[lang])
    text.append(PUNCT)
    chars = sorted({ch for s in text for ch in s if is_cjk(ch)})
    (out / f"cjk-chars-{name}.txt").write_text("".join(chars) + "\n", encoding="utf-8")
    print(f"cjk-chars-{name}.txt: {len(chars)} chars")
PY

# Шаг 2. Без хинтинга (кривые, не растр), без подпрограмм CFF (меньше и проще читателю),
# без layout-фич (шейпинга нет: знак = глиф по cmap).
for pair in "sc:$NOTO_SC:NotoSansSC-care.otf" "jp:$NOTO_JP:NotoSansJP-care.otf"; do
  IFS=: read -r name src dst <<<"$pair"
  "$UV" run --quiet --with fonttools pyftsubset "$src" \
    --text-file="$OUT_CHARS/cjk-chars-$name.txt" \
    --no-hinting --desubroutinize --layout-features='' \
    --output-file="$OUT_FONTS/$dst"
  echo "$dst: $(wc -c <"$OUT_FONTS/$dst" | tr -d ' ') bytes"
done
