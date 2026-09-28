# care-labels: CJK-сабсеты

`build-cjk-subset.sh` режет Noto Sans CJK до знаков, которые печатают составники, и пишет
`src/fonts/NotoSansSC-care.otf` (строки `cn`) и `src/fonts/NotoSansJP-care.otf` (строки `jp`).
Наборы знаков — `cjk-chars-sc.txt` / `cjk-chars-jp.txt`, генерируются тем же скриптом из
`tmp/plans/care-labels/fiber-translations.json` + базового набора имён волокон (§6.2 плана).
Правка переводов CN/JP ⇒ пересобрать сабсеты и закоммитить оба `.txt` и оба `.otf`.

## Исходники (в репо НЕ кладутся, ~16 МБ каждый)

Лицензия — SIL OFL 1.1 (`src/fonts/OFL-NotoSansCJK.txt`). Скачаны 2026-09-28 из официального
репозитория `notofonts/noto-cjk`, тег `Sans2.004`, в `tmp/plans/care-labels/fonts-src/`:

| файл | адрес | sha256 |
|---|---|---|
| NotoSansCJKsc-Regular.otf | https://github.com/notofonts/noto-cjk/raw/Sans2.004/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf | `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b` |
| NotoSansCJKjp-Regular.otf | https://github.com/notofonts/noto-cjk/raw/Sans2.004/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf | `68a3fc98800b2a27b371f2fb79991daf3633bd89309d4ffaa6946fd587f375b5` |
| LICENSE (OFL) | https://github.com/notofonts/noto-cjk/raw/Sans2.004/LICENSE | `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2` |

```sh
cd tmp/plans/care-labels/fonts-src
curl -fLO https://github.com/notofonts/noto-cjk/raw/Sans2.004/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf
curl -fLO https://github.com/notofonts/noto-cjk/raw/Sans2.004/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf
shasum -a 256 *.otf        # сверить с таблицей
cd - && scripts/care-labels/build-cjk-subset.sh   # из корня репо клиента; нужен ~/.local/bin/uv
```

Пути переопределяются переменными `FIBER_JSON`, `NOTO_SC`, `NOTO_JP`, `UV`.
