// ЛИЦО НАБОРА, А НЕ ВЕСЬ НАБОР. Здесь лежат ОТОБРАННЫЕ ~274 ссылки — то, что человек видит,
// открыв пикер и ничего не набрав, разложенное спектром рукой. Остальные ~4 400 приезжают
// отдельным чанком при первом открытии пикера (`ensurePantoneLibrary`, ниже) — полная библиотека
// Pantone FHI TCX и Solid Coated. И любой набранный код по-прежнему принимается как набран
// («use “19-4005 TCX” as typed»): у красильни бывает свой номер, которого нет ни в одной книге.
//
// `hex` is an APPROXIMATE screen rendering — a swatch to tell entries apart in a list, never a
// colour standard. Nothing downstream reads it; the stored value is the code string alone, exactly
// as `Material.pantone` and `ColorwayDevelopment.pantone` already hold it (free text).
//
// ═══ ДВЕ СЕМЬИ, И ОДНА ИЗ НИХ БЫЛА ПУСТА (r3 п.13) ═══════════════════════════════════════════════
//
// Владелец: «очень мало цветов в пантоне». Замер до правки: 120 записей, ВСЕ текстильные (TCX), а
// solid coated — семья, которой красят лейблы, пуговицы и фурнитуру и коды которой владелец
// приносит с собой («407 C», «1635 C», «7419 C»), — в списке отсутствовала ЦЕЛИКОМ. То есть
// человек, державший в руках solid-код, не мог не то что выбрать его глазами — он не видел ни
// одного соседа, чтобы сравнить. Регулярка такой код принимала (r2), но принимать набранное и
// ПОКАЗЫВАТЬ семью — разные вещи, и вторая половина сделана здесь.
//
// ⚠ И СПИСОК ВСЁ РАВНО ОСТАЛСЯ КОРОТКИМ — 274 ПРОТИВ ~4 700 (круг 4). Владелец повторил жалобу
// теми же словами. Прежний довод («выписать библиотеку по памяти = выдумать справочник») был
// верен и остаётся верным: выдумывать её нельзя. Но выписывать её и не надо — набор собран
// СКРИПТОМ из открытых источников (`scratchpad/pantone/build-pantone-data.mjs` называет их и их
// лицензии), лежит в `pantone-swatches-data.ts` и подтягивается лениво. Ни одного кода отсюда
// не выдумано; всё, чего нет и там, по-прежнему вводится строкой «use “…” as typed».
export type PantoneFamily = 'textile' | 'solid';
export type PantoneSwatch = { code: string; name: string; hex: string; family: PantoneFamily };

/** `[code, name, approximate screen hex]`. Разложено кортежами, чтобы семья писалась один раз. */
type Row = readonly [string, string, string];

/* ── TEXTILE · TCX (крашеный хлопок — им меряют полотно) ─────────────────────────────────────── */
const TEXTILE: readonly Row[] = [
  // reds
  ['18-1664 TCX', 'Fiery Red', '#D01C1F'],
  ['19-1664 TCX', 'True Red', '#BF1932'],
  ['18-1662 TCX', 'Flame Scarlet', '#CD212A'],
  ['18-1763 TCX', 'High Risk Red', '#C71F2D'],
  ['19-1763 TCX', 'Racing Red', '#BD162C'],
  ['18-1655 TCX', 'Mars Red', '#BC2731'],
  ['19-1663 TCX', 'Ribbon Red', '#B92636'],
  ['19-1557 TCX', 'Chili Pepper', '#9B1B30'],
  ['19-1862 TCX', 'Jester Red', '#9E1030'],
  ['19-1543 TCX', 'Brick Red', '#8C3730'],
  ['18-1434 TCX', 'Etruscan Red', '#A2574B'],
  ['18-1438 TCX', 'Marsala', '#955251'],
  ['19-1533 TCX', 'Cowhide', '#884344'],
  // pinks · magentas
  ['12-1706 TCX', 'Pink Dogwood', '#F7D1D1'],
  ['13-1520 TCX', 'Rose Quartz', '#F7CAC9'],
  ['13-2808 TCX', 'Ballet Slipper', '#EBBED3'],
  ['14-2311 TCX', 'Prism Pink', '#F0A1BF'],
  ['18-2120 TCX', 'Honeysuckle', '#D94F70'],
  ['17-1937 TCX', 'Hot Pink', '#E55982'],
  ['17-2031 TCX', 'Fuchsia Rose', '#C74375'],
  ['18-2140 TCX', 'Cabaret', '#CB3373'],
  ['18-1750 TCX', 'Viva Magenta', '#BB2649'],
  ['19-2024 TCX', 'Rhododendron', '#722B3F'],
  ['19-1627 TCX', 'Port Royale', '#502B33'],
  ['19-2620 TCX', 'Winetasting', '#492A34'],
  // yellows · oranges
  ['13-0647 TCX', 'Illuminating', '#F5DF4D'],
  ['12-0752 TCX', 'Buttercup', '#FAE03C'],
  ['14-0852 TCX', 'Freesia', '#F3C12C'],
  ['14-0848 TCX', 'Mimosa', '#F0C05A'],
  ['16-0946 TCX', 'Honey', '#BA9238'],
  ['15-0942 TCX', 'Sauterne', '#C5A253'],
  ['15-1058 TCX', 'Radiant Yellow', '#FC9E21'],
  ['16-1364 TCX', 'Vibrant Orange', '#FF7420'],
  ['16-1462 TCX', 'Golden Poppy', '#F56733'],
  ['17-1456 TCX', 'Tigerlily', '#E2583E'],
  ['17-1463 TCX', 'Tangerine Tango', '#DD4124'],
  ['13-1023 TCX', 'Peach Fuzz', '#FFBE98'],
  ['16-1546 TCX', 'Living Coral', '#FF6F61'],
  // greens
  ['19-0417 TCX', 'Kombu Green', '#3A4032'],
  ['19-0509 TCX', 'Rosin', '#36362D'],
  ['19-6311 TCX', 'Greener Pastures', '#37503D'],
  ['18-0135 TCX', 'Treetop', '#476A30'],
  ['18-0117 TCX', 'Vineyard Green', '#5F7355'],
  ['18-0426 TCX', 'Capulet Olive', '#656344'],
  ['18-0525 TCX', 'Iguana', '#818455'],
  ['17-0627 TCX', 'Dried Herb', '#847A59'],
  ['16-0632 TCX', 'Willow', '#9A8B4F'],
  ['17-5641 TCX', 'Emerald', '#009473'],
  ['16-6340 TCX', 'Classic Green', '#39A845'],
  ['17-0145 TCX', 'Green Flash', '#79C753'],
  ['15-0343 TCX', 'Greenery', '#88B04B'],
  // blues
  ['19-4052 TCX', 'Classic Blue', '#0F4C81'],
  ['19-4027 TCX', 'Estate Blue', '#233658'],
  ['19-3933 TCX', 'Medieval Blue', '#29304E'],
  ['19-4010 TCX', 'Total Eclipse', '#2C313D'],
  ['19-4024 TCX', 'Dress Blues', '#2A3244'],
  ['19-3920 TCX', 'Peacoat', '#2B2E43'],
  ['19-4025 TCX', 'Mood Indigo', '#353A4C'],
  ['19-4028 TCX', 'Insignia Blue', '#2F3E55'],
  ['19-3810 TCX', 'Eclipse', '#343148'],
  ['19-4150 TCX', 'Princess Blue', '#00539C'],
  ['18-4140 TCX', 'French Blue', '#0072B5'],
  ['18-3943 TCX', 'Blue Iris', '#5A5B9F'],
  ['18-4025 TCX', 'Copen Blue', '#516B84'],
  ['17-4041 TCX', 'Marina', '#4F84C4'],
  ['17-4021 TCX', 'Faded Denim', '#798EA4'],
  ['16-4019 TCX', 'Forever Blue', '#899BB8'],
  ['15-4020 TCX', 'Cerulean', '#9BB7D4'],
  ['15-3919 TCX', 'Serenity', '#91A8D0'],
  ['14-4122 TCX', 'Airy Blue', '#92B6D5'],
  ['14-4318 TCX', 'Sky Blue', '#8ABAD3'],
  ['15-5217 TCX', 'Blue Turquoise', '#55B9C4'],
  ['15-5519 TCX', 'Turquoise', '#45B5AA'],
  ['14-4811 TCX', 'Aqua Sky', '#7BC4C4'],
  // purples · violets
  ['13-3820 TCX', 'Lavender Fog', '#D2C4D6'],
  ['15-3817 TCX', 'Lavender', '#AFA4CE'],
  ['16-3520 TCX', 'African Violet', '#B085B7'],
  ['17-3938 TCX', 'Very Peri', '#6667AB'],
  ['18-3224 TCX', 'Radiant Orchid', '#AD5E99'],
  ['18-3025 TCX', 'Striking Purple', '#944E87'],
  ['18-3838 TCX', 'Ultra Violet', '#5F4B8B'],
  ['19-3438 TCX', 'Bright Violet', '#784384'],
  ['19-3325 TCX', 'Wood Violet', '#75406A'],
  ['19-3542 TCX', 'Pansy', '#653D7C'],
  ['19-3632 TCX', 'Petunia', '#4F3466'],
  // browns
  ['17-1230 TCX', 'Mocha Mousse', '#A47864'],
  ['18-1142 TCX', 'Leather Brown', '#97572B'],
  ['18-1160 TCX', 'Sudan Brown', '#AC6B29'],
  ['18-1248 TCX', 'Rust', '#B55A30'],
  ['18-1027 TCX', 'Bison', '#6E4F3A'],
  ['19-1116 TCX', 'Carafe', '#5D473A'],
  ['19-1213 TCX', 'Shopping Bag', '#5A4743'],
  ['19-1218 TCX', 'Potting Soil', '#54392D'],
  ['19-1012 TCX', 'French Roast', '#58423F'],
  ['19-1420 TCX', 'Cappuccino', '#4E3B31'],
  ['18-1306 TCX', 'Iron', '#736460'],
  // whites · creams · sands
  ['11-0601 TCX', 'Bright White', '#F4F9FF'],
  ['11-4001 TCX', 'Brilliant White', '#EDF1FE'],
  ['11-0602 TCX', 'Snow White', '#F2F0EB'],
  ['11-4201 TCX', 'Cloud Dancer', '#F0EEE9'],
  ['11-4800 TCX', 'Blanc de Blanc', '#E8E9E4'],
  ['11-0105 TCX', 'Marshmallow', '#F0EEE4'],
  ['11-0103 TCX', 'Egret', '#F3E8DE'],
  ['13-0002 TCX', 'White Sand', '#DFDDD7'],
  ['13-0000 TCX', 'Moonbeam', '#CDCDC0'],
  ['12-0804 TCX', 'Cloud Cream', '#E6DDC5'],
  ['13-0905 TCX', 'Birch', '#DDD5C7'],
  ['13-1008 TCX', 'Bleached Sand', '#DFCDB6'],
  ['13-1106 TCX', 'Sand Dollar', '#DECDBE'],
  ['14-1210 TCX', 'Shifting Sand', '#D8C0AD'],
  ['14-1118 TCX', 'Beige', '#D5BA98'],
  ['15-1214 TCX', 'Warm Taupe', '#AF9483'],
  ['16-1334 TCX', 'Tan', '#B69574'],
  // blacks · greys
  ['19-0303 TCX', 'Jet Black', '#2D2C2F'],
  ['19-4005 TCX', 'Stretch Limo', '#2B2B2B'],
  ['19-4006 TCX', 'Caviar', '#292A2D'],
  ['19-4007 TCX', 'Anthracite', '#28282D'],
  ['19-3921 TCX', 'Black Iris', '#2B3042'],
  ['19-0201 TCX', 'Asphalt', '#434447'],
  ['19-3906 TCX', 'Dark Shadow', '#4A4B4D'],
  ['18-0201 TCX', 'Castlerock', '#5F5E62'],
  ['18-3905 TCX', 'Excalibur', '#676168'],
  ['17-3907 TCX', 'Quicksilver', '#7E7D88'],
  ['17-5104 TCX', 'Ultimate Gray', '#939597'],
  ['16-4402 TCX', 'Neutral Gray', '#8E918F'],
  ['16-3801 TCX', 'Opal Gray', '#A49E9E'],
  ['15-4101 TCX', 'High-rise', '#AEB2B5'],
  ['14-4201 TCX', 'Lunar Rock', '#C5C5C5'],
  ['14-4102 TCX', 'Glacier Gray', '#C5C6C8'],
  ['12-4306 TCX', 'Barely Blue', '#DBE1E1'],
];

/* ── SOLID COATED · «C» (печать по лейблам, пуговицам, фурнитуре — всё, что не крашеное полотно) ─
   Базовые краски и обе серые лестницы стоят целиком: по ним сверяют оттенок глазами, и лестница с
   вырванной ступенью для этого бесполезна. Номерные — отобранные ходовые, не весь веер. */
const SOLID: readonly Row[] = [
  // base inks
  ['Yellow C', 'Yellow', '#FEDD00'],
  ['Yellow 012 C', 'Yellow 012', '#FFD700'],
  ['Orange 021 C', 'Orange 021', '#FE5000'],
  ['Warm Red C', 'Warm Red', '#F9423A'],
  ['Red 032 C', 'Red 032', '#EF3340'],
  ['Rubine Red C', 'Rubine Red', '#CE0058'],
  ['Rhodamine Red C', 'Rhodamine Red', '#E10098'],
  ['Purple C', 'Purple', '#BB29BB'],
  ['Violet C', 'Violet', '#440099'],
  ['Blue 072 C', 'Blue 072', '#10069F'],
  ['Reflex Blue C', 'Reflex Blue', '#001489'],
  ['Process Blue C', 'Process Blue', '#0085CA'],
  ['Green C', 'Green', '#00AB84'],
  ['Black C', 'Black', '#2D2926'],
  ['Process Black C', 'Process Black', '#27251F'],
  ['Black 2 C', 'Black 2', '#332F21'],
  ['Black 3 C', 'Black 3', '#212322'],
  ['Black 4 C', 'Black 4', '#31261D'],
  ['Black 6 C', 'Black 6', '#101820'],
  ['Black 7 C', 'Black 7', '#3D3935'],
  ['877 C', 'Silver', '#8A8D8F'],
  ['871 C', 'Gold', '#85754E'],
  // reds
  ['179 C', 'Signal Red', '#E03C31'],
  ['185 C', 'Bright Red', '#E4002B'],
  ['186 C', 'Classic Red', '#C8102E'],
  ['187 C', 'Deep Red', '#A6192E'],
  ['188 C', 'Oxblood', '#76232F'],
  ['199 C', 'Cherry', '#D50032'],
  ['200 C', 'Cardinal', '#BA0C2F'],
  ['201 C', 'Wine Red', '#9D2235'],
  ['202 C', 'Burgundy', '#862633'],
  ['1797 C', 'Poppy Red', '#CB333B'],
  ['1807 C', 'Brick', '#983222'],
  ['7427 C', 'Crimson', '#971B2F'],
  ['7419 C', 'Dusty Rose', '#9E5359'],
  ['7421 C', 'Claret', '#651D32'],
  // pinks · magentas
  ['213 C', 'Bright Pink', '#E31C79'],
  ['219 C', 'Fuchsia Pink', '#DA1884'],
  ['226 C', 'Magenta', '#D0006F'],
  ['233 C', 'Deep Magenta', '#C6007E'],
  ['241 C', 'Orchid Purple', '#AF1685'],
  ['208 C', 'Raspberry', '#862041'],
  ['209 C', 'Plum Red', '#6C1D45'],
  ['259 C', 'Aubergine', '#6A1A41'],
  // oranges
  ['151 C', 'Bright Orange', '#FF8200'],
  ['158 C', 'Burnt Orange', '#E87722'],
  ['165 C', 'Vivid Orange', '#FF671F'],
  ['172 C', 'Flame', '#FA4616'],
  ['1375 C', 'Apricot', '#FF9E1B'],
  ['1585 C', 'Traffic Orange', '#FF6900'],
  ['1595 C', 'Copper Orange', '#D86018'],
  ['1655 C', 'Safety Orange', '#FC4C02'],
  ['1665 C', 'Rust Orange', '#DC4405'],
  ['1675 C', 'Terracotta', '#A9431E'],
  // yellows · golds
  ['100 C', 'Pastel Yellow', '#F6EB61'],
  ['101 C', 'Light Yellow', '#F7EA48'],
  ['102 C', 'Bright Yellow', '#FCE300'],
  ['103 C', 'Dark Gold', '#C5A900'],
  ['109 C', 'Sunflower', '#FFD100'],
  ['110 C', 'Mustard Gold', '#DAAA00'],
  ['116 C', 'Golden Yellow', '#FFCD00'],
  ['123 C', 'Amber', '#FFC72C'],
  ['130 C', 'Marigold', '#F2A900'],
  ['137 C', 'Tangerine', '#FFA300'],
  ['144 C', 'Pumpkin', '#ED8B00'],
  ['7406 C', 'Straw', '#F1BE48'],
  ['7548 C', 'Taxi Yellow', '#FFC600'],
  // greens
  ['326 C', 'Mint Green', '#00B2A9'],
  ['335 C', 'Bottle Green', '#00664F'],
  ['341 C', 'Forest Green', '#007856'],
  ['348 C', 'Kelly Green', '#00843D'],
  ['349 C', 'Pine', '#046A38'],
  ['355 C', 'Grass Green', '#009639'],
  ['356 C', 'Emerald Green', '#007A33'],
  ['361 C', 'Fresh Green', '#43B02A'],
  ['368 C', 'Apple Green', '#78BE20'],
  ['375 C', 'Lime', '#97D700'],
  ['376 C', 'Olive Lime', '#84BD00'],
  ['382 C', 'Chartreuse', '#C4D600'],
  ['390 C', 'Moss', '#B5BD00'],
  ['575 C', 'Fern', '#4A7729'],
  // blues
  ['280 C', 'Navy', '#012169'],
  ['281 C', 'Deep Navy', '#00205B'],
  ['286 C', 'Royal Blue', '#0033A0'],
  ['287 C', 'Cobalt', '#003087'],
  ['288 C', 'Midnight Blue', '#002D72'],
  ['293 C', 'Electric Blue', '#003DA5'],
  ['294 C', 'Ink Blue', '#002F6C'],
  ['300 C', 'True Blue', '#005EB8'],
  ['301 C', 'Steel Blue', '#004C97'],
  ['306 C', 'Sky', '#00B5E2'],
  ['313 C', 'Lagoon', '#0092BC'],
  ['319 C', 'Aqua', '#2DCCD3'],
  ['320 C', 'Teal', '#009CA6'],
  ['3005 C', 'Azure', '#0077C8'],
  ['3125 C', 'Turquoise', '#00AEC7'],
  ['7462 C', 'Slate Blue', '#00539B'],
  ['7546 C', 'Charcoal Blue', '#253746'],
  ['541 C', 'Prussian Blue', '#003C71'],
  ['548 C', 'Petrol', '#003B49'],
  // purples · violets
  ['265 C', 'Lilac', '#9063CD'],
  ['266 C', 'Bright Violet', '#753BBD'],
  ['267 C', 'Royal Purple', '#5F259F'],
  ['268 C', 'Deep Purple', '#582C83'],
  ['269 C', 'Dark Plum', '#512D6D'],
  ['273 C', 'Indigo Violet', '#2E1A47'],
  ['2607 C', 'Grape', '#500778'],
  // browns · neutrals
  ['469 C', 'Chestnut', '#693F23'],
  ['476 C', 'Espresso', '#4E3629'],
  ['477 C', 'Chocolate', '#623B2A'],
  ['483 C', 'Mahogany', '#653024'],
  ['484 C', 'Sienna', '#9A3324'],
  ['490 C', 'Maroon Brown', '#5D2A2C'],
  ['497 C', 'Dark Chocolate', '#472425'],
  ['505 C', 'Bordeaux', '#6F263D'],
  // cool grays
  ['Cool Gray 1 C', 'Cool Gray 1', '#D9D9D6'],
  ['Cool Gray 2 C', 'Cool Gray 2', '#D0D0CE'],
  ['Cool Gray 3 C', 'Cool Gray 3', '#C8C9C7'],
  ['Cool Gray 4 C', 'Cool Gray 4', '#BBBCBC'],
  ['Cool Gray 5 C', 'Cool Gray 5', '#B1B3B3'],
  ['Cool Gray 6 C', 'Cool Gray 6', '#A7A8AA'],
  ['Cool Gray 7 C', 'Cool Gray 7', '#97999B'],
  ['Cool Gray 8 C', 'Cool Gray 8', '#888B8D'],
  ['Cool Gray 9 C', 'Cool Gray 9', '#75787B'],
  ['Cool Gray 10 C', 'Cool Gray 10', '#63666A'],
  ['Cool Gray 11 C', 'Cool Gray 11', '#53565A'],
  // warm grays
  ['Warm Gray 1 C', 'Warm Gray 1', '#D7D2CB'],
  ['Warm Gray 2 C', 'Warm Gray 2', '#CBC4BC'],
  ['Warm Gray 3 C', 'Warm Gray 3', '#BFB8AF'],
  ['Warm Gray 4 C', 'Warm Gray 4', '#B6ADA5'],
  ['Warm Gray 5 C', 'Warm Gray 5', '#ACA39A'],
  ['Warm Gray 6 C', 'Warm Gray 6', '#A59C94'],
  ['Warm Gray 7 C', 'Warm Gray 7', '#968C83'],
  ['Warm Gray 8 C', 'Warm Gray 8', '#8C8279'],
  ['Warm Gray 9 C', 'Warm Gray 9', '#83786F'],
  ['Warm Gray 10 C', 'Warm Gray 10', '#796E65'],
  ['Warm Gray 11 C', 'Warm Gray 11', '#6E6259'],
  // greys · blacks (numbered)
  ['425 C', 'Graphite', '#54585A'],
  ['426 C', 'Near Black', '#25282A'],
  ['430 C', 'Silver Gray', '#7C878E'],
  ['431 C', 'Storm Gray', '#5B6770'],
  ['432 C', 'Slate', '#333F48'],
  ['433 C', 'Gunmetal', '#1D252D'],
  ['445 C', 'Dark Gray', '#3F4444'],
];

const row =
  (family: PantoneFamily) =>
  ([code, name, hex]: Row): PantoneSwatch => ({
    code,
    name,
    hex,
    family,
  });

/**
 * ПОРЯДОК СЕМЕЙ НЕСУЩИЙ: текстиль первым, потому что здесь шьют, а не печатают, и человек,
 * открывший пикер без запроса, обязан увидеть сначала то, чем красят полотно.
 *
 * ⚠ И ПОРЯДОК ВНУТРИ СЕМЬИ ТОЖЕ. Список раньше открывался семнадцатью почти-белыми: три первых ряда
 * сетки — то, что человек видит, не листая, — читались как пустая рамка, и это ровно та «бедность»,
 * на которую жаловался владелец. Внутри семьи цветá идут спектром (красные → розовые → жёлтые →
 * зелёные → синие → фиолетовые), потом коричневые, и только потом нейтральные: белые и чёрные
 * ищут КОДОМ, а глазами выбирают цвет.
 *
 * С оттенками (ниже) это правило держит уже не рука, а `searchPantone`: пустой запрос раскладывает
 * лицо по `PANTONE_SHADES` — спектр, земля, нейтральные — и каждый оттенок от светлого к тёмному.
 * Ручной порядок остался порядком выдачи ПО ЗАПРОСУ (там решает код, потом имя) и порядком чтения
 * этого файла.
 */
const SWATCHES: PantoneSwatch[] = [...TEXTILE.map(row('textile')), ...SOLID.map(row('solid'))];

/**
 * ЛИЦО — ЭТО ИМЕННО ЭТИ 274, И ЗАПОМИНАЮТСЯ ОНИ ДО ТОГО, КАК МАССИВ НАЧНЁТ РАСТИ. Пустой запрос без
 * оттенка показывает сначала их, потом библиотеку (`searchPantone`), и отличать одних от других
 * по индексу нельзя: фильтр семьи индексы сдвигает.
 */
const FACE: ReadonlySet<PantoneSwatch> = new Set(SWATCHES);

/**
 * ⚠ МАССИВ ЖИВОЙ, А НЕ ЗАМОРОЖЕННЫЙ, И ЭТО НЕСУЩЕЕ. Полная библиотека (см. ниже) ДОПИСЫВАЕТСЯ В
 * НЕГО ЖЕ, а не подменяет его новым: `palette.tsx` держит на этот массив ссылку и ищет по нему
 * (`pantoneOfHex`), и переприсваивание экспорта прошло бы мимо такой ссылки молча.
 */
export const PANTONE_SWATCHES: readonly PantoneSwatch[] = SWATCHES;

/* ═══ ПОЛНАЯ БИБЛИОТЕКА, ДОГРУЖАЕМАЯ ЛЕНИВО ══════════════════════════════════════════════════════
 *
 * Владелец, круг 4: «почему в пантоне так мало цветов». Отобранных выше 274 — это ~6% ссылок,
 * которыми реально красят, и человек, державший в руках свой номер, его не находил.
 *
 * ПОЛНЫЙ НАБОР ЖИВЁТ ОТДЕЛЬНЫМ МОДУЛЕМ (`pantone-swatches-data.ts`, ~4 700 записей, 112 КБ
 * исходника) И ТЯНЕТСЯ ДИНАМИЧЕСКИМ ИМПОРТОМ ПРИ ПЕРВОМ ОТКРЫТИИ ПИКЕРА. Причина не в весе
 * страницы вообще, а в том, ЧЕЙ это вес: вкладка тех-карты грузится целиком у каждого, кто её
 * открыл, а пантон нужен тому, кто заводит колорвей. Отдельный чанк платит только он и только раз.
 *
 * ⚠ СИНХРОННЫЕ ВЫЗЫВАЮЩИЕ НЕ ТРОНУТЫ, И ЭТО УСЛОВИЕ, А НЕ УДОБСТВО. `findPantone` читают ПРЯМО В
 * РЕНДЕРЕ четыре зоны (`colourway-create`, `palette`, `onmodel/paint-group`, `pattern/colourways`),
 * и async-ветка там означала бы четыре новых состояния загрузки ради подписи под квадратом.
 * Поэтому отобранные 274 остаются ЖЁСТКОЙ ЧАСТЬЮ модуля: до загрузки всё отвечает ровно как
 * раньше, после — шире. Ни один вызывающий не обязан знать, что библиотека вообще есть.
 *
 * ⚠ ОТОБРАННАЯ ЗАПИСЬ СТАРШЕ БИБЛИОТЕЧНОЙ ПРИ СОВПАДЕНИИ КОДА, И НЕ ИЗ ВЕЖЛИВОСТИ. У 19 из 274
 * hex расходится с библиотечным на единицы (глазом на квадрате 60px не читается), НО именно этот
 * hex уезжает на провод как `development.dev_hex`. Пусти библиотеку вперёд — и два колорвея с
 * одним пантоном, заведённые до и после загрузки чанка, разошлись бы в `dev_hex` без всякой
 * причины. Имена номерных solid-кодов («179 C» → «Signal Red») библиотека не знает вовсе: у
 * Pantone их нет, это подписи цеха, и терять их поиску нельзя.
 */
type LibraryState = 'idle' | 'loading' | 'ready' | 'failed';
let libraryState: LibraryState = 'idle';
let libraryPromise: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

/**
 * Код → свотч. Кладётся ДВА ключа на запись: полный код и он же без хвоста семьи, поэтому
 * «18-1662» и «18-1662 TCX» — одна и та же дверь, а «100» больше не может достаться «1002 C».
 */
const byCode = new Map<string, PantoneSwatch>();
const indexKeys = (code: string) => {
  const full = code.toLowerCase();
  const bare = full.replace(/\s+(tcx|tpg|tpx|tn|tsx|c|u|cp|up)$/, '');
  return bare === full ? [full] : [full, bare];
};
const indexSwatch = (s: PantoneSwatch) => {
  for (const k of indexKeys(s.code)) if (!byCode.has(k)) byCode.set(k, s);
};
SWATCHES.forEach(indexSwatch);

/** Сколько ссылок сейчас в наборе — пикер печатает это число, отвечая на «почему так мало». */
export function pantoneCount(): number {
  return SWATCHES.length;
}

/** Меняется, когда набор вырос. Снимок для `useSyncExternalStore`. */
export function pantoneVersion(): number {
  return version;
}

export function subscribePantone(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Догрузить полную библиотеку. Идемпотентно: второй зов отдаёт тот же промис, а после успеха —
 * уже выполненный. Отказ (чанк не приехал) НЕ бросается наружу: пикер остаётся с отобранными 274
 * и говорит об этом словами, а не пустой сеткой.
 */
export function ensurePantoneLibrary(): Promise<void> {
  if (libraryPromise) return libraryPromise;
  libraryState = 'loading';
  libraryPromise = import('./pantone-swatches-data')
    .then(({ TEXTILE_PACKED, SOLID_PACKED }) => {
      absorb(TEXTILE_PACKED, 'textile');
      absorb(SOLID_PACKED, 'solid');
      libraryState = 'ready';
    })
    .catch(() => {
      libraryState = 'failed';
    })
    .then(() => {
      version += 1;
      listeners.forEach((fn) => fn());
    });
  return libraryPromise;
}

export function pantoneLibraryState(): LibraryState {
  return libraryState;
}

/** `code|name|hex;…`, hex без решётки — распаковка ровно здесь, формат больше нигде не знают. */
function absorb(packed: string, family: PantoneFamily): void {
  for (const record of packed.split(';')) {
    const a = record.indexOf('|');
    const b = record.indexOf('|', a + 1);
    if (a < 0 || b < 0) continue;
    const code = record.slice(0, a);
    if (byCode.has(code.toLowerCase())) continue;
    const swatch: PantoneSwatch = {
      code,
      name: record.slice(a + 1, b),
      hex: `#${record.slice(b + 1)}`,
      family,
    };
    SWATCHES.push(swatch);
    indexSwatch(swatch);
  }
}

/**
 * ═══ ДВЕ СЕМЬИ ССЫЛОК PANTONE, А НЕ ОДНА ══════════════════════════════════════════════════════
 * Список выше — ТЕКСТИЛЬНЫЙ (TCX: крашеный хлопок, тем и меряют ткань) плюс SOLID COATED — «407 C»,
 * «1635 C», «7419 C»: так печатают лейблы, пуговицы, фурнитуру и всё, что не крашеное полотно.
 * Регулярка принимала только `NN-NNNN`, и набранное «407 C» не давало строки «use as typed» вовсе
 * — то есть код, который человек держит в руках, в карточку было не ввести.
 *
 * ПРИНИМАЕТСЯ:
 *   · текстиль  `18-1248`, `18-1248 TCX`, `18-1248TCX`, `18 1248 tcx` (суффикс TCX/TPG/TPX/TN/TSX)
 *   · solid     `407 C`, `407C`, `1635 U`, `7419 CP` (три-четыре цифры + C/U/CP/UP)
 *   · с приставкой `PANTONE ` спереди — так код и лежит в чужих спецификациях
 * НЕ принимается голое число: `407` без буквы не говорит, coated это или uncoated, а нормализовать
 * его значило бы ВЫДУМАТЬ половину ссылки. Пустая подсказка под полем называет обе формы.
 *
 * ⚠ ИМЕНОВАННЫЕ КРАСКИ (`Reflex Blue C`, `Cool Gray 7 C`) СЮДА НЕ ВХОДЯТ НАМЕРЕННО: их не набирают,
 * их ВЫБИРАЮТ из сетки, и `choose` кладёт код списка как есть, мимо этой функции. Признать их здесь
 * значило бы завести разбор произвольных английских слов и принять за ссылку любую опечатку.
 */
const PANTONE_TEXTILE_RE = /^(\d{2})[-\s]?(\d{4})\s*(TCX|TPG|TPX|TN|TSX)?$/i;
const PANTONE_SOLID_RE = /^(\d{3,4})\s*(C|U|CP|UP)$/i;

/**
 * ОДНО НАПИСАНИЕ НА ХРАНЕНИЕ. Поле свободнотекстовое (`Material.pantone`,
 * `ColorwayDevelopment.pantone`, `TechCardBomItem.pantone`), и «407c», «PANTONE 407 C» и «407 C» —
 * один и тот же цвет тремя строками: они не сравнятся, не сгруппируются и не найдутся поиском.
 * Поэтому написание приводится ЗДЕСЬ, у самой проверки, а не в каждом вызывающем: `18-1248 TCX`
 * и `407 C` — верхний регистр, один пробел перед суффиксом, дефис в текстильном номере.
 *
 * ⚠ ЭТО И ЕСТЬ ПРОВЕРКА «читается ли набранное как ссылка»: непустой ответ — да, '' — нет. Двух
 * органов (регулярка отдельно, нормализация отдельно) здесь быть не может — они разойдутся, и
 * строка предложит «use “407 C” as typed», а положит в поле что-то другое.
 */
export function normalizePantone(input?: string): string {
  const body = (input ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^PANTONE\s+/i, '');
  if (!body) return '';
  const textile = PANTONE_TEXTILE_RE.exec(body);
  if (textile) {
    const suffix = textile[3] ? ` ${textile[3].toUpperCase()}` : '';
    return `${textile[1]}-${textile[2]}${suffix}`;
  }
  const solid = PANTONE_SOLID_RE.exec(body);
  if (solid) return `${solid[1]} ${solid[2].toUpperCase()}`;
  return '';
}

/* ═══ ОТТЕНКИ: ЧЕМ ИСКАТЬ, А НЕ ЧТО УТВЕРЖДАТЬ ═════════════════════════════════════════════════
 *
 * Владелец: «юзер должен иметь возможность выбрать цвет из пантон пикера удобным интерфейсом с
 * поиском по подцветам». 4 700 кодов — это сорок страниц сетки по 120, а ни имя («Kombu Green»,
 * «Moonbeam»), ни номер («18-0426») не говорят, где лежат оливковые, пока ответ не известен заранее.
 * Оттенок — это вторая дверь в тот же набор: «покажи мне синие», и сетка становится градиентом.
 *
 * ⚠ ОТТЕНОК ВЫЧИСЛЯЕТСЯ ИЗ `hex`, А `hex` — ЭКРАННОЕ ПРИБЛИЖЕНИЕ (см. шапку). Поэтому оттенок —
 * способ НАЙТИ код и никогда не суждение о стандарте: «Moonbeam лежит в grey» значит «на экране
 * он серый, ищи его среди серых», и больше ничего. Он нигде не хранится, на провод не уезжает и в
 * спецификацию не попадает; цвет на границе двух оттенков лежит в одном из них, а к другому его
 * по-прежнему ведут имя и код.
 *
 * ПРАВИЛА (HSL экранного hex; порядок несущий — решает первое сработавшее):
 *   · white   L ≥ 0.88 и хрома ≤ 0.10
 *   · black   L ≤ 0.10, или L < 0.20 и S ≤ 0.25
 *   · grey    S ≤ 0.12 или хрома ≤ 0.07
 *   · brown   тон 15–45 и L < 0.45 · тон 15–55 и S ≤ 0.45 (песок, беж, хаки, тауп) ·
 *             красный тон, L < 0.45 и S ≤ 0.35 (рыжевато-бурые, «Russet», «Brown Out»)
 *   · дальше по тону: red 345–15 (при L > 0.7 — pink) · orange 15–40 · yellow 40–70 (тёмный и
 *     приглушённый, тон ≥ 45, L < 0.45, S < 0.5 — это олива, green) · green 70–170 ·
 *     teal 170–190 · blue 190–255 · violet 255–320 · pink 320–345
 *
 * ⚠ БЕЛЫЙ И СЕРЫЙ МЕРЯЮТСЯ ХРОМОЙ (max − min), А НЕ ТОЛЬКО S, И ЭТО НЕ ВКУС. HSL-насыщенность
 * делит хрому на то, сколько её вообще возможно при этой светлоте, а у самого белого возможно
 * почти ноль: «Snow White» #F2F0EB с хромой 0.027 получает S = 0.21 и уезжал бы в жёлтые, ivory
 * #FFFFF0 — S = 1.0. Хрома отвечает на тот вопрос, который здесь задан: «много ли тут цвета».
 *
 * ⚠ ГРАНИЦЫ СВЕРЕНЫ С ИМЕНАМИ БИБЛИОТЕКИ, А НЕ С УЧЕБНИКОМ. На тоне 160–170 лежат 25 имён со
 * словом «Green» и три с «Blue» — поэтому teal начинается с 170; на 190–200 — 46 «Blue» против
 * четырёх «Aqua»/«Teal», поэтому на 190 он кончается; на 300–320 — 21 «Purple», «Violet»,
 * «Orchid» и ни одного «Pink», поэтому pink начинается с 320. Чёрные Pantone («Jet Black»,
 * «Caviar», «Black C») на экране светлее 0.10, и один порог «L ≤ 0.10» оставил бы в black горстку
 * кодов на 4 700; угольный #333 (L = 0.20) при этом остаётся серым — black строго ниже.
 */
export type PantoneShade =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'violet'
  | 'pink'
  | 'brown'
  | 'grey'
  | 'white'
  | 'black';

/**
 * Спектром, потом земля и нейтральные — тот же принцип, что у лица набора: глазами выбирают цвет,
 * белые и чёрные ищут кодом. `hex` — образец для квадрата в пикере, взятый из самого набора
 * (Flame Scarlet, Vibrant Orange, Illuminating, Classic Green, 320 C, Classic Blue, Ultra
 * Violet, 213 C, Leather Brown, Ultimate Gray, Snow White, Jet Black), и каждый из них
 * `shadeOf` относит к своему же оттенку.
 */
export const PANTONE_SHADES: readonly { id: PantoneShade; label: string; hex: string }[] = [
  { id: 'red', label: 'red', hex: '#CD212A' },
  { id: 'orange', label: 'orange', hex: '#FF7420' },
  { id: 'yellow', label: 'yellow', hex: '#F5DF4D' },
  { id: 'green', label: 'green', hex: '#39A845' },
  { id: 'teal', label: 'teal', hex: '#009CA6' },
  { id: 'blue', label: 'blue', hex: '#0F4C81' },
  { id: 'violet', label: 'violet', hex: '#5F4B8B' },
  { id: 'pink', label: 'pink', hex: '#E31C79' },
  { id: 'brown', label: 'brown', hex: '#97572B' },
  { id: 'grey', label: 'grey', hex: '#939597' },
  { id: 'white', label: 'white', hex: '#F2F0EB' },
  { id: 'black', label: 'black', hex: '#2D2C2F' },
];

/** `null` — не hex. H в градусах, S/L/хрома — 0…1. */
function hslOf(hex: string): { h: number; s: number; l: number; c: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const digits = m[1].length === 3 ? m[1].replace(/./g, (d) => d + d) : m[1];
  const n = parseInt(digits, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const c = max - min;
  const l = (max + min) / 2;
  const s = c === 0 ? 0 : c / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (c !== 0) {
    if (max === r) h = ((g - b) / c) % 6;
    else if (max === g) h = (b - r) / c + 2;
    else h = (r - g) / c + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l, c };
}

/** HSL-светлота экранного hex, 0 (чёрный) … 1 (белый). Не hex — середина, 0.5. */
export function lightnessOf(hex: string): number {
  return hslOf(hex)?.l ?? 0.5;
}

/** Оттенок экранного hex — правила в шапке раздела. Не hex — grey: цвета в нём не прочесть. */
export function shadeOf(hex: string): PantoneShade {
  const hsl = hslOf(hex);
  if (!hsl) return 'grey';
  const { h, s, l, c } = hsl;
  if (l >= 0.88 && c <= 0.1) return 'white';
  if (l <= 0.1 || (l < 0.2 && s <= 0.25)) return 'black';
  if (s <= 0.12 || c <= 0.07) return 'grey';
  const redHue = h >= 345 || h < 15;
  if (h >= 15 && h < 45 && l < 0.45) return 'brown';
  if (h >= 15 && h < 55 && s <= 0.45) return 'brown';
  if (redHue && l < 0.45 && s <= 0.35) return 'brown';
  if (redHue) return l > 0.7 ? 'pink' : 'red';
  if (h < 40) return 'orange';
  if (h < 70) return h >= 45 && l < 0.45 && s < 0.5 ? 'green' : 'yellow';
  if (h < 170) return 'green';
  if (h < 190) return 'teal';
  if (h < 255) return 'blue';
  if (h < 320) return 'violet';
  return 'pink';
}

/**
 * Оттенок и светлота свотча, посчитанные ОДИН РАЗ. Ключ — сам свотч, а не набор: библиотека
 * дописывается в массив при первом открытии (`absorb`), и её строки получают тон при первом же
 * вопросе, ничего не зная об этом кэше. `WeakMap` — чтобы кэш не держал записи, которых нет.
 */
type Tone = { shade: PantoneShade; rank: number; l: number };
const SHADE_RANK = new Map(PANTONE_SHADES.map((s, i) => [s.id, i] as const));
const tones = new WeakMap<PantoneSwatch, Tone>();
function toneOf(s: PantoneSwatch): Tone {
  let tone = tones.get(s);
  if (!tone) {
    const shade = shadeOf(s.hex);
    tone = { shade, rank: SHADE_RANK.get(shade) ?? 0, l: lightnessOf(s.hex) };
    tones.set(s, tone);
  }
  return tone;
}

/** Светлые впереди: внутри одного оттенка сетка читается градиентом. */
const lighterFirst = (a: PantoneSwatch, b: PantoneSwatch) => toneOf(b).l - toneOf(a).l;
/** Оттенки спектром, внутри оттенка — от светлого к тёмному. */
const bySpectrum = (a: PantoneSwatch, b: PantoneSwatch) =>
  toneOf(a).rank - toneOf(b).rank || lighterFirst(a, b);

/**
 * Слово запроса, которое само есть оттенок. Помимо двенадцати имён — то, чем оттенок называют в
 * цеху: «navy» — синий, «olive» — зелёный, «beige» и «khaki» — коричневый, «ivory» и «cream» —
 * белый. Совпадение — по слову целиком: «tan» здесь нет, потому что это и «Tangerine».
 * `Map`, а не литерал объекта: у литерала есть прототип, и «constructor» в поле поиска нашёлся бы
 * в нём как оттенок.
 */
const SHADE_WORDS: ReadonlyMap<string, PantoneShade> = new Map<string, PantoneShade>([
  ...PANTONE_SHADES.map((s) => [s.id, s.id] as const),
  ['gray', 'grey'],
  ['navy', 'blue'],
  ['olive', 'green'],
  ['beige', 'brown'],
  ['khaki', 'brown'],
  ['ivory', 'white'],
  ['cream', 'white'],
  ['purple', 'violet'],
  ['turquoise', 'teal'],
]);

/** Имена Pantone пишут «Gray», люди — «grey»: для поиска по имени это одно слово. */
const spelling = (text: string) => text.replace(/grey/g, 'gray');

/**
 * Case-insensitive, «19 4005» and «19-4005» both find the swatch; a name word finds by name.
 *
 * ⚠ ПОТОЛКА БОЛЬШЕ НЕТ, И ЭТО ПЕРЕЕЗД ОТВЕТСТВЕННОСТИ, А НЕ ЕЁ ОТМЕНА. Он стоял сначала на 24,
 * потом на 600 — и оба раза молча решал за пикер, сколько тот покажет. При 4 700 записях число,
 * зашитое здесь, снова врало бы: «19-40» отдаёт полсотни попаданий, пустой запрос — весь набор,
 * и резать их одинаково нечем. Сколько нарисовать за раз — вопрос СЕТКИ (у неё есть высота и
 * кнопка «show more»), и решается он там. Здесь считается только КТО подошёл.
 *
 * ⚠ КОД СТАРШЕ ИМЕНИ В ВЫДАЧЕ. Набравший «19-4052» ищет ссылку, а не слово: попадания по коду
 * идут первыми, и внутри каждой половины сохраняется порядок набора — отобранные 274 впереди
 * библиотечных.
 *
 * ═══ ОТТЕНОК — ФИЛЬТР, И ОН ЖЕ СЛОВО ЗАПРОСА ═══════════════════════════════════════════════════
 *
 *   · `shade` сужает пул ДО поиска: всё, что ниже, происходит внутри одного оттенка.
 *   · Слово запроса из `SHADE_WORDS` («green», «grey», «navy») добавляет ПОСЛЕ попаданий по коду и
 *     имени весь свой оттенок — а если рядом стоят другие слова («dark green»), то те из него, чьё
 *     имя или код их содержит. Имя по-прежнему впереди: набравший «olive» первым видит 22
 *     «…Olive», а только за ними — остальные оливковые. «Blue Turquoise» на «blue» при этом
 *     находится, хотя на экране он teal: попадание по имени оттенком не фильтруется.
 *   · ПОРЯДОК. Без запроса: внутри оттенка — от светлого к тёмному; без оттенка — оттенки спектром,
 *     каждый градиентом, но СНАЧАЛА лицо набора (отобранные 274), потом библиотека. Иначе первая
 *     страница сетки — 120 красных из 2 800, и человек не видит, что в наборе вообще есть синие.
 *     С запросом — прежний порядок (код, потом имя), а добранный словом оттенок — градиентом.
 */
export function searchPantone(
  query: string,
  { limit, family, shade }: { limit?: number; family?: PantoneFamily; shade?: PantoneShade } = {},
): PantoneSwatch[] {
  const cap = (list: PantoneSwatch[]) => (limit === undefined ? list : list.slice(0, limit));
  const pool = SWATCHES.filter(
    (s) => (!family || s.family === family) && (!shade || toneOf(s).shade === shade),
  );
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) {
    if (shade) return cap(pool.sort(lighterFirst));
    const face = pool.filter((s) => FACE.has(s)).sort(bySpectrum);
    const rest = pool.filter((s) => !FACE.has(s)).sort(bySpectrum);
    return cap(face.concat(rest));
  }

  const qCode = q.replace(/\s/g, '-');
  const qName = spelling(q);
  const byCodeHit: PantoneSwatch[] = [];
  const byNameHit: PantoneSwatch[] = [];
  for (const s of pool) {
    const code = s.code.toLowerCase();
    if (code.includes(q) || code.includes(qCode)) byCodeHit.push(s);
    else if (spelling(s.name.toLowerCase()).includes(qName)) byNameHit.push(s);
  }
  const hits = byCodeHit.concat(byNameHit);

  const words = q.split(' ');
  const asked = new Set(words.flatMap((w) => SHADE_WORDS.get(w) ?? []));
  if (asked.size === 0) return cap(hits);
  const rest = words.filter((w) => !SHADE_WORDS.has(w)).join(' ');
  const restName = spelling(rest);
  const taken = new Set(hits);
  const byShade = pool
    .filter(
      (s) =>
        !taken.has(s) &&
        asked.has(toneOf(s).shade) &&
        (!rest ||
          s.code.toLowerCase().includes(rest) ||
          spelling(s.name.toLowerCase()).includes(restName)),
    )
    .sort(bySpectrum);
  return cap(hits.concat(byShade));
}

/**
 * The swatch behind a stored code, for the colour square next to a value. Unknown codes get none.
 *
 * ⚠ ТОЧНОЕ СОВПАДЕНИЕ СТАРШЕ ПРЕФИКСНОГО, И С ВЫРОСШИМ СПИСКОМ ЭТО ПЕРЕСТАЛО БЫТЬ ФОРМАЛЬНОСТЬЮ:
 * «100 C» — префикс «1002 C», а `find` вернул бы того из двух, кто ближе к началу массива. Теперь
 * отвечает индекс: в нём лежит и полный код, и он же без хвоста семьи, поэтому «100» попадает
 * ровно в «100 C». Перебор остаётся ХВОСТОМ — на случай набранного огрызка вроде «18-16», и на
 * 4 700 записях он стоит доли миллисекунды, потому что доходит до него только промах.
 */
export function findPantone(code?: string): PantoneSwatch | undefined {
  const c = (code ?? '').trim().toLowerCase();
  if (!c) return undefined;
  return byCode.get(c) ?? SWATCHES.find((s) => s.code.toLowerCase().startsWith(c));
}
