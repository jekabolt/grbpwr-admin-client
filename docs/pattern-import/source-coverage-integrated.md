# Сравнение 80 исходных PDF на объединённой версии

Полный корпус запущен 20 ноября 2026 года на зафиксированной сборке `ba3d0a8d3d05f553f731c00922d20c5a0f2730642872f69e2684034fdb5c93dc`. Вход — прежние 80 оригинальных PDF и карты размеров из [исходной инвентаризации](source-coverage.md). Сохранены штатные вопросы и запрет прохода через незакрытые детали. Базой служит обычный импорт 19–20 ноября с 6390 замкнутыми из 7757 сочетаний. Версии после старта этого прогона учитываются в отдельных опытах.

На тех же 80 PDF число закрытых ячеек выросло **с 6390/7757 до 6487/7811**. Из прироста в 97 ячеек 46 были открыты в исходном прогоне, ещё 51 относится к впервые найденным деталям Opal и Colleen. Три из 54 новых ячеек остались открытыми. Ни одна прежняя закрытая ячейка не потеряла статус. Это измерение всей объединённой версии. В отдельном сравнении автоматического мостика подтверждено ноль новых закрытий.

| Набор | PDF | Закрыты до | Закрыты после | Открытые → закрыты | Новые закрытые ячейки | Потери | Изменённые закрытые срезы | Apply до | Apply после | DXF без блокирующих проверок до | DXF после | Изделий с любым записанным DXF после |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| set40 | 40 | 3781 | 3823 | 9 | 33 | 0 | 89 | 0 | 0 | 0 | 0 | 0 |
| holdout40 | 40 | 2609 | 2664 | 37 | 18 | 0 | 37 | 5 | 6 | 6 | 9 | 10 |
| Всего | 80 | 6390 | 6487 | 46 | 51 | 0 | 126 | 5 | 6 | 6 | 9 | 10 |

[Парное сравнение каждого из 80 изделий](integrated-paired-documents.csv).

Для каждого файла в колонках DXF считается число прошедших материалов, включая успешный материал изделия, другой материал которого удержан. Исходный статус проверен по сохранённым DXF и результату штатного gate. На новой версии использованы `passed` и `manifestOk` каждого записанного материала. Запись диагностического файла сама по себе не считается успешной. Колонка «Новые закрытые ячейки» учитывает сочетания, которые не сопоставились с прежним семейством по seed/названию и размеру. «Изменённые закрытые срезы» сравниваются по массиву вершин с округлением до 0,1 мм. Для восьми ранних исходных снимков такой контроль финальных срезов недоступен. Изменившаяся последовательность вершин требует отдельной геометрической проверки.

## Где остановился штатный импорт

| Набор | Шаг остановки или apply | До | После |
| --- | --- | --- | --- |
| set40 | sheet | 1 | 1 |
| set40 | pieces | 39 | 39 |
| holdout40 | sheet | 3 | 3 |
| holdout40 | sizes | 1 | 1 |
| holdout40 | pieces | 19 | 17 |
| holdout40 | meaning | 9 | 9 |
| holdout40 | check | 3 | 4 |
| holdout40 | apply | 5 | 6 |

Savannah и Tulip впервые прошли Pieces и оба остановились на check. Colleen перешла с check на apply. Все пять прежних изделий, доходивших до apply, снова его достигли. Ранее проходившие Pieces изделия сохранили проход.

Из 15 записанных DXF у 10 изделий проверку прошли 9 материалов у 7 изделий. У шести изделий приняты все материалы. У Elderberry прошёл main, второй материал удержан. В исходном прогоне было 10 записанных DXF у 8 изделий, 6 принятых материалов и 5 изделий на apply. Три дополнительных принятых материала — main и interlining Colleen и interlining Maple.

## Охват оставшихся открытых сочетаний

| Набор | Открыты после | Полный путь | Составной цикл | Общая фигура | Конкуренция | Недостаточно сведений |
| --- | --- | --- | --- | --- | --- | --- |
| set40 | 938 | 2 | 2 | 0 | 0 | 934 |
| holdout40 | 386 | 17 | 2 | 0 | 1 | 366 |
| Всего | 1324 | 19 | 4 | 0 | 1 | 1300 |

[Полная таблица по документам и деталям](source-coverage-integrated.csv). Для воспроизведения используются команды из [методики исходного скана](source-coverage.md) со снимками нового прогона.

## Какой класс проведёт целое изделие через Pieces

| Механизм источника | Изделий, где он покрывает все открытые размеры | Идентификаторы |
| --- | --- | --- |
| fullPath | 0 | — |
| compositeCycle | 0 | — |
| sharedGroup | 0 | — |
| Все три класса вместе | 0 | — |

На Pieces осталось 56 изделий. У восьми скан нашёл 23 ячейки с единственным геометрическим кандидатом. Ещё у одной ячейки Sedona есть конкурирующие варианты. Ни у одного изделия эти три класса не объясняют все оставшиеся размеры. Подтверждённый дополнительный выход через Pieces по этой инвентаризации — 0.

| Изделие | Единственная семья без достаточных штрихов после скана | Осталось ячеек | Исходы |
| --- | --- | --- | --- |
| MDF368-The-Albuca-A-Line-Dress-XXS-4XL-A4-Letter-Patterns | B - FRONT | 3 | leak |
| A4-MDF348-The-Cassandra-Kaftan-Dress-Sizes-00-32 | A - SHOULDER | 7 | leak |
| MoodFabrics.com-MDF235-Layton-Pattern-1 | seed 5 | 8 | refused |

| Один и тот же отказ во всех оставшихся ячейках изделия | Изделий | Идентификаторы |
| --- | --- | --- |
| E2-hole-end | 4 | MDF368-The-Albuca-A-Line-Dress-XXS-4XL-A4-Letter-Patterns, MDF518-Estoril-Collared-A-Line-Dress, A4-MDF348-The-Cassandra-Kaftan-Dress-Sizes-00-32, MDF501-Spokane-Hoodie |
| draw:no-model:inconsistent | 4 | MDF368-The-Albuca-A-Line-Dress-XXS-4XL-A4-Letter-Patterns, MDF518-Estoril-Collared-A-Line-Dress, MDF501-Spokane-Hoodie, MDF502-Harrington-Hoodie |
| E2-hole | 3 | MDF368-The-Albuca-A-Line-Dress-XXS-4XL-A4-Letter-Patterns, MDF518-Estoril-Collared-A-Line-Dress, MDF501-Spokane-Hoodie |
| E2-holes-sum | 2 | MDF518-Estoril-Collared-A-Line-Dress, MDF501-Spokane-Hoodie |
| G15-holes-mm | 2 | MDF518-Estoril-Collared-A-Line-Dress, MDF501-Spokane-Hoodie |
| E1-cover | 1 | MDF518-Estoril-Collared-A-Line-Dress |

Первой очередью для проверки исходного PDF выбраны незакреплённые концы пропуска (E2-hole-end). Этот отказ повторился у всех оставшихся размеров Albuca (3), Estoril (3), Cassandra (7) и Spokane (3). Начать можно с единственного семейства Albuca B. Размерный прогноз несовместим с опорными формами также у четырёх изделий. В две группы входят пять разных изделий, три из них общие. Для каждого нужно показать обе границы пропуска на печатном исходнике и исключить соседний размер, внутренний штрих и линию другого назначения. Пока по этой очереди подтверждено 0 новых проходов Pieces.

У одной ячейки бывает несколько причин отказа. Общий код помогает выбрать исходные PDF для разбора. Единственной причиной остановки и гарантией прохода он не является.

## Какие прежние срезы изменились

По исходному и новому кольцу взяты все вершины и отсчёты с шагом 0,5 мм. Сравнение двустороннее, в координатах исходного листа. Проверено 126 различающихся прежних срезов у 34 изделий, из них у 70 максимальное смещение больше 0,1 мм. Само изменение не устанавливает, какая версия соответствует оригинальному PDF. [Все затронутые детали и размеры](integrated-changed-outlines.csv).

Наибольшие расхождения у Silverstone 5XL — G SKIRT FRONT LINING 76,47 мм и E SKIRT BACK 75,59 мм. Старые площади обоих срезов были меньше соседнего 4XL, новые площади больше. Требуется сверка с исходным размерным штрихом. У Taos E SLEEVES UPPER 2 изменение 12,13 мм, у Reims G CORSET FRONT MIDDLE 22 — 4,59 мм.

## Изделия, у которых изменился результат

| Набор | Изделие | До | После | Закрыты из открытых | Новые ячейки | Потери | Изменение прежнего среза | Шаг | Прошедшие DXF |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| set40 | 2-A4-MDF-349-The-Leah-Shift-Dress-00-32- | 110 | 110 | 0 | 0 | 0 | 1 | pieces → pieces | — |
| set40 | MDF340-THE-OPAL-DRESS-FREE-PATTERN | 48 | 81 | 0 | 33 | 0 | 1 | pieces → pieces | — |
| set40 | MDF363-The-Memoir-Dress-View-A-Sizes-00-32-A4-Letter-Patterns | 228 | 228 | 0 | 0 | 0 | 9 | pieces → pieces | — |
| set40 | MDF368-The-Albuca-A-Line-Dress-XXS-4XL-A4-Letter-Patterns | 15 | 15 | 0 | 0 | 0 | 1 | pieces → pieces | — |
| set40 | MDF388-The-Rosalina-Bodycon-Dress-Sizes-XXS-4XL-A4-Letter-Patterns | 39 | 39 | 0 | 0 | 0 | 8 | pieces → pieces | — |
| set40 | MDF390-The-Corella-Beach-Cover-Up-Sizes-XXS-4XL-A4-Letter-Patterns | 21 | 21 | 0 | 0 | 0 | 1 | pieces → pieces | — |
| set40 | MDF432-Asheville-Dress | 56 | 56 | 0 | 0 | 0 | 1 | pieces → pieces | — |
| set40 | MDF439-Mendocino-A-Line-Dress | 53 | 53 | 0 | 0 | 0 | 1 | pieces → pieces | — |
| set40 | MDF453-Kitchen-Pickleball-Dress | 94 | 94 | 0 | 0 | 0 | 2 | pieces → pieces | — |
| set40 | MDF458-Nob-Hill-Draped-Midi-Dress | 32 | 34 | 2 | 0 | 0 | 4 | pieces → pieces | — |
| set40 | MDF474-Soho-Maxi-Slip-Dress | 66 | 67 | 1 | 0 | 0 | 0 | pieces → pieces | — |
| set40 | MDF489-Silverstone-Mini-Dress | 80 | 80 | 0 | 0 | 0 | 6 | pieces → pieces | — |
| set40 | MDF515-Selenite-V-Waist-Ballgown | 65 | 66 | 1 | 0 | 0 | 8 | pieces → pieces | — |
| set40 | MDF518-Estoril-Collared-A-Line-Dress | 87 | 87 | 0 | 0 | 0 | 2 | pieces → pieces | — |
| set40 | MDF535-Reef-Sleeveless-Cover-Up | 80 | 80 | 0 | 0 | 0 | 3 | pieces → pieces | — |
| set40 | MDF539-Lynx-Mini-Shift-Dress | 54 | 54 | 0 | 0 | 0 | 1 | pieces → pieces | — |
| set40 | MDF346-Kalla-Ensemble | 263 | 265 | 2 | 0 | 0 | 0 | pieces → pieces | — |
| set40 | MDF387-The-Paris-Mini-Dress-Sizes-00-32-A4-Letter-Patterns | 213 | 213 | 0 | 0 | 0 | 5 | pieces → pieces | — |
| set40 | MDF521-Reims-Soiree-Dress | 185 | 185 | 0 | 0 | 0 | 2 | pieces → pieces | — |
| set40 | MDF481-Verona-Sheath-Gown | 124 | 124 | 0 | 0 | 0 | 13 | pieces → pieces | — |
| set40 | MDF373-The-Olympia-Tennis-Dress-Sizes-00-32-A4-Letter-Patterns | 170 | 170 | 0 | 0 | 0 | 11 | pieces → pieces | — |
| set40 | MDF477-Venice-V-Waist-Dress | 119 | 119 | 0 | 0 | 0 | 2 | pieces → pieces | — |
| set40 | MDF433-Taos-Dress | 140 | 140 | 0 | 0 | 0 | 4 | pieces → pieces | — |
| set40 | MDF476-Fawn-Mini-Dress | 50 | 53 | 3 | 0 | 0 | 0 | pieces → pieces | — |
| set40 | MDF364-The-Memoir-Dress-View-B-Sizes-00-32-A4-Letter-PATTERNS | 162 | 162 | 0 | 0 | 0 | 3 | pieces → pieces | — |
| holdout40 | MDF543-Matrix-Shawl-Collar-Ensemble | 54 | 54 | 0 | 0 | 0 | 2 | pieces → pieces | — |
| holdout40 | MDF372-The-Ventura-Sweatsuit-Ensemble-Sizes-00-32-A4-Letter-Patterns | 165 | 173 | 8 | 0 | 0 | 3 | pieces → pieces | — |
| holdout40 | MDF332-Tulip-Pattern-Letter-A4-Tiled-1 | 88 | 108 | 20 | 0 | 0 | 2 | pieces → check | — |
| holdout40 | MDF271-Clark-Pattern | 89 | 89 | 0 | 0 | 0 | 1 | pieces → pieces | — |
| holdout40 | MDF436-Sarasota-Set | 44 | 44 | 0 | 0 | 0 | 6 | pieces → pieces | — |
| holdout40 | MDF383-The-Cher-Jacket-Sizes-00-32-A4-Letter-Patterns | 216 | 219 | 3 | 0 | 0 | 0 | pieces → pieces | — |
| holdout40 | MDF238-Lita-Pattern | 78 | 78 | 0 | 0 | 0 | 1 | pieces → pieces | — |
| holdout40 | MDF280-Savannah-Pattern | 175 | 180 | 5 | 0 | 0 | 1 | pieces → check | — |
| holdout40 | MDF400-The-Penelope-Pants-Sizs-00-32-A4-Letter-Patterns | 27 | 27 | 0 | 0 | 0 | 1 | pieces → pieces | — |
| holdout40 | MDF549-Sedona-Tailored-Cargo-Shorts | 108 | 109 | 1 | 0 | 0 | 7 | pieces → pieces | — |
| holdout40 | MDF089-Maple-Pattern | 24 | 24 | 0 | 0 | 0 | 0 | apply → apply | main, interlining |
| holdout40 | MDF501-Spokane-Hoodie | 51 | 51 | 0 | 0 | 0 | 6 | pieces → pieces | — |
| holdout40 | MDF502-Harrington-Hoodie | 67 | 67 | 0 | 0 | 0 | 1 | pieces → pieces | — |
| holdout40 | MDF338-Colleen-Letter-A4-Tiled | 126 | 144 | 0 | 18 | 0 | 6 | check → apply | main, interlining |

В позднем отдельном прогоне Tulip прошёл apply, замкнув 108/108. Это другой снимок кода. В таблице выше изделие остановилось на check G19 и G22. [Поздняя проверка Tulip](tulip-source-outlines.md).

В этом корпусе Layton сохранил 24 закрытия и остановку на Pieces. Отдельная сборка восстановила 16 ластовиц и исключила цифры плиток, после чего изделие прошло Pieces до check. Сверка периметров с PDF и DXF приведена в grbpwr-admin-client-wt-layton/docs/pattern-import/layton-source-check.md.

В отдельной проверке Savannah прошла G5. С исходной картой материалов оба материала ещё удерживались на check. В варианте с контрастной тканью принят один из трёх DXF. Ни один из этих запусков не достиг apply. [Проверка Savannah по исходнику и DXF](savannah-source-check.md).
