# Парный прогон 80 PDF после объединения Albuca, Spokane, Paris, Harrington и Estoril

На тех же исходных PDF и картах размеров закрыты 6633 из 7795 сочетаний «деталь × размер». До переноса было 6549. Доля закрытых выросла с 84,02% до 85,09%. Новые закрытия, повторные отказы и изменения ранее закрытых границ посчитаны для той же ячейки в двух сборках. Для каждого из 80 файлов проверены SHA-256 оригинала и список размеров.

| Набор | PDF | Закрыты до | После | Всего | Новые | Повторно открыты | Изменены прежние контуры | Прошли Pieces | Достигли apply | Принятые DXF |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| set40 | 40 | 3853 | 3910 | 4761 | 57 | 0 | 10 | 1 → 3 | 0 → 0 | 0 → 0 |
| holdout40 | 40 | 2696 | 2723 | 3034 | 27 | 0 | 6 | 20 → 21 | 7 → 7 | 10 → 10 |
| Всего | 80 | 6549 | 6633 | 7795 | 84 | 0 | 16 | 21 → 24 | 7 → 7 | 10 → 10 |

## Сравнение с исходным контролем

| Снимок | set40 закрыты | holdout40 закрыты | Всего закрыты | Прошли Pieces | Достигли apply | Принятые DXF |
| --- | --- | --- | --- | --- | --- | --- |
| Исходный контроль | 3781 | 2609 | 6390 | 17 | 5 | 6 |
| До переноса Olympia | 3857 | 2696 | 6553 | 21 | 7 | 10 |
| После Olympia | 3853 | 2696 | 6549 | 21 | 7 | 10 |
| Текущий | 3910 | 2723 | 6633 | 24 | 7 | 10 |

| База | Набор | Было закрыто | Стало | Закрылись новые | Стали открытыми или исчезли | Δ изделий после Pieces |
| --- | --- | --- | --- | --- | --- | --- |
| Исходный контроль | set40 | 3781 | 3910 | 134 | 5 | 3 |
| Исходный контроль | holdout40 | 2609 | 2723 | 122 | 8 | 4 |
| До Olympia | set40 | 3857 | 3910 | 56 | 3 | 2 |
| До Olympia | holdout40 | 2696 | 2723 | 27 | 0 | 1 |
| Olympia | set40 | 3853 | 3910 | 57 | 0 | 2 |
| Olympia | holdout40 | 2696 | 2723 | 27 | 0 | 1 |

Исходный контроль содержал 7757 ячеек, текущий — 7795. От исходного контроля прибавились 256 закрытых ячеек, 13 прежних открылись или исчезли. Чистый прирост составил 243. [Результаты предыдущей сборки Olympia](olympia-corpus-80.md).

Прохождение Pieces означает достижение Meaning, Fabrics, Check, Write или Apply. У принятого файла материала одобрены gate и манифест. Показатель apply относится к нативному прогону с тестовым сохранением. Отдельные диагностические DXF и эталоны в него не входят.

## Пять целевых изделий

| PDF | Закрыты | Изменились прежние | Этап до | Этап после | Принятые файлы после |
| --- | --- | --- | --- | --- | --- |
| Albuca | 15 → 18 / 18 | 0 | pieces | check | 0 |
| Spokane | 51 → 53 / 54 | 1 | pieces | pieces | 0 |
| Paris | 214 → 216 / 252 | 2 | pieces | pieces | 0 |
| Harrington | 67 → 70 / 70 | 4 | pieces | meaning | 0 |
| Estoril | 87 → 90 / 90 | 0 | pieces | meaning | 0 |

## Сохранность геометрии

У 6533 закрытых в обеих версиях ячеек совпали все вершины с полной точностью. Расхождения у всех 16 остальных ячеек видны уже после округления до 0,1 мм. Для этих изменений дополнительно измерены расстояния до полного замкнутого периметра в обоих направлениях с шагом до 0,5 мм. Расхождение массивов само по себе не устанавливает, какая версия ближе к PDF. [Изменившиеся детали и размеры](material-corpus-changes.csv).

У 34 изделий за пределами пяти целевых изменились статусы ячеек, прежние вершины или достигнутый этап. Названия и результаты для всех 80 изделий приведены в [парной таблице](material-corpus-documents.csv).

| Исходный PDF | Добавились | Потеряны | Этап до → после |
| --- | --- | --- | --- |
| MDF383-The-Cher-Jacket-Sizes-00-32-A4-Letter-Patterns | 5 | 0 | pieces → pieces |
| MDF543-Matrix-Shawl-Collar-Ensemble | 5 | 0 | pieces → pieces |
| MDF372-The-Ventura-Sweatsuit-Ensemble-Sizes-00-32-A4-Letter-Patterns | 4 | 0 | pieces → pieces |
| MDF439-Mendocino-A-Line-Dress | 4 | 0 | pieces → pieces |
| MDF476-Fawn-Mini-Dress | 4 | 0 | pieces → pieces |
| MDF521-Reims-Soiree-Dress | 4 | 0 | pieces → pieces |
| MDF549-Sedona-Tailored-Cargo-Shorts | 4 | 0 | pieces → pieces |
| MDF453-Kitchen-Pickleball-Dress | 3 | 0 | pieces → pieces |
| MDF528-Alassio-Wrap-Dress | 3 | 0 | pieces → pieces |
| MDF539-Lynx-Mini-Shift-Dress | 3 | 0 | pieces → pieces |
| MDF346-Kalla-Ensemble | 2 | 0 | pieces → pieces |
| MDF364-The-Memoir-Dress-View-B-Sizes-00-32-A4-Letter-PATTERNS | 2 | 0 | pieces → pieces |
| MDF404-The-Harper-Plisse-Dress-Sizes-00-32-A4-Letter-Patterns | 2 | 0 | pieces → pieces |
| MDF411-The-Ambrosia-Cocktail-Dress-Sizes-00-32-A4-Letter-Patterns | 2 | 0 | pieces → pieces |
| MDF426-Ophelia-Dress | 2 | 0 | pieces → pieces |
| MDF450-Madison-Tea-Length-Dress | 2 | 0 | pieces → pieces |
| MDF456-Anne-Waistcoat-Ensemble | 2 | 0 | pieces → pieces |
| MDF515-Selenite-V-Waist-Ballgown | 2 | 0 | pieces → pieces |
| 2-MDF350-The-Dyanna-Dress-00-32-A4-PATTERNS | 1 | 0 | pieces → pieces |
| MDF363-The-Memoir-Dress-View-A-Sizes-00-32-A4-Letter-Patterns | 1 | 0 | pieces → pieces |
| MDF365-The-Memoir-Dress-View-C-Sizes-00-32-A4-Letter-Patterns | 1 | 0 | pieces → pieces |
| MDF373-The-Olympia-Tennis-Dress-Sizes-00-32-A4-Letter-Patterns | 1 | 0 | pieces → pieces |
| MDF388-The-Rosalina-Bodycon-Dress-Sizes-XXS-4XL-A4-Letter-Patterns | 1 | 0 | pieces → pieces |
| MDF408-The-Axel-Shirt-Dress-Sizes-00-32-A4-Letter-Patterns | 1 | 0 | pieces → pieces |
| MDF422-The-Valentina-V-Waist-Dress-Sizes-XXS-4XL-A4-Letter-Patterns | 1 | 0 | pieces → pieces |
| MDF432-Asheville-Dress | 1 | 0 | pieces → pieces |
| MDF433-Taos-Dress | 1 | 0 | pieces → pieces |
| MDF458-Nob-Hill-Draped-Midi-Dress | 1 | 0 | pieces → pieces |
| MDF474-Soho-Maxi-Slip-Dress | 1 | 0 | pieces → pieces |
| MDF477-Venice-V-Waist-Dress | 1 | 0 | pieces → pieces |
| MDF492-Altena-Blouse | 1 | 0 | pieces → pieces |
| MDF522-Merano-Balloon-Sleeve-Blouse | 1 | 0 | pieces → pieces |
| MDF535-Reef-Sleeveless-Cover-Up | 1 | 0 | pieces → pieces |
| MFD393-The-Emma-Double-Tiered-Dress-Sizes-00-32-A4-Letter-Patterns | 1 | 0 | pieces → pieces |

Проверка корпуса измеряет статус и различие геометрии. Независимое сравнение с оригинальными источниковыми операциями выполнялось отдельно для пяти целевых изделий. По побочным закрытиям основанием служит только результат импортера, пока для этого размера не проведена отдельная проверка.

## Выпущенные файлы

Штатный writer записал 17 DXF в предыдущем прогоне и 18 в текущем, включая файлы с удержанием gate. У 17 совпали изделие и материал. После исключения двух печатных меток времени, времени создания манифеста и длительности gate все 17 файлов совпали по тегам DXF, геометрии и содержимому манифеста. Единственный дополнительный файл записан для Albuca и удержан на Check.

- MDF368-The-Albuca-A-Line-Dress-XXS-4XL-A4-Letter-Patterns/baseline-dxf/main.dxf

## Воспроизведение

Предыдущая сборка Olympia — `cf188d6284b88dd7867d71603cd182e3491be61a3db9491b2b944c8050c0fd10`, текущая — `5f230d74754f7454ec1272fb3b14d00ea89523912cbf44f194ed1100ad798cee`. Снимок до Olympia — `978e985c24e649bd9458cbb542b70bf1dd20c961cef6c4f2045f3b270049adbb`. Все проверки выполнены одним worker последовательно с AUTOPILOT_OUTLINES=1 и запретом обхода открытых контуров. Сборка заморожена до отдельных работ Harrington Meaning и Alassio 30–32. Каталог прогона — `/private/tmp/patimport-runs/material-integrated-80`. В нём сохранены входной манифест, хэши исходников и bundle, нативные состояния, DXF и детальное сравнение.
