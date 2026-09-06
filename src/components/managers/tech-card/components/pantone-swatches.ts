// A SUGGESTION LIST, NOT A DICTIONARY. The picker searches these by code and by name, but any code
// the operator types is accepted as typed («use “19-4005 TCX” as typed»): the Pantone fashion
// library runs to ~2,600 TCX references and a closed list would refuse the dyehouse's own number.
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
// ⚠ И СПИСОК ПО-ПРЕЖНЕМУ НЕ БИБЛИОТЕКА, И ЭТО СКАЗАНО ЧЕЛОВЕКУ ЛИЦОМ ПИКЕРА. Полная библиотека —
// ~2 600 TCX и ~2 300 solid; выписать её сюда по памяти значило бы выдумать имена и hex'ы, то есть
// подделать справочник, по которому потом красят. Здесь стоит ОТОБРАННЫЙ набор, каждая запись
// которого проверяема, а всё, чего в нём нет, вводится строкой «use “…” as typed» — ровно как и
// раньше. Пикер говорит обе вещи там, где на них смотрят: «suggestions, not the full library».
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

const row = (family: PantoneFamily) => ([code, name, hex]: Row): PantoneSwatch => ({
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
 */
export const PANTONE_SWATCHES: readonly PantoneSwatch[] = [
  ...TEXTILE.map(row('textile')),
  ...SOLID.map(row('solid')),
];

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
  const body = (input ?? '').trim().replace(/\s+/g, ' ').replace(/^PANTONE\s+/i, '');
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

/**
 * Case-insensitive, «19 4005» and «19-4005» both find the swatch; a name word finds by name.
 *
 * ⚠ ПОТОЛОК ПОДНЯТ ВМЕСТЕ СО СПИСКОМ (r3 п.13). Он стоял на 24 — при 120 записях это молча
 * показывало ПЯТУЮ ЧАСТЬ набора тому, кто открыл пикер, ничего не набрав, и ровно это владелец
 * назвал «очень мало цветов». Сетка теперь листается, а не обрывается; потолок остаётся только
 * как защита от списка, выросшего до тысяч.
 */
export function searchPantone(
  query: string,
  { limit = 600, family }: { limit?: number; family?: PantoneFamily } = {},
): PantoneSwatch[] {
  const pool = family ? PANTONE_SWATCHES.filter((s) => s.family === family) : PANTONE_SWATCHES;
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return pool.slice(0, limit);
  const qCode = q.replace(/\s/g, '-');
  const hits = pool.filter(
    (s) =>
      s.code.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(qCode) ||
      s.name.toLowerCase().includes(q),
  );
  return hits.slice(0, limit);
}

/**
 * The swatch behind a stored code, for the colour square next to a value. Unknown codes get none.
 *
 * ⚠ ТОЧНОЕ СОВПАДЕНИЕ СТАРШЕ ПРЕФИКСНОГО, И С ВЫРОСШИМ СПИСКОМ ЭТО ПЕРЕСТАЛО БЫТЬ ФОРМАЛЬНОСТЬЮ:
 * «100 C» — префикс «1002 C», а `find` вернул бы того из двух, кто ближе к началу массива. Поэтому
 * сначала ищется равенство по всему списку и только потом — начало строки.
 */
export function findPantone(code?: string): PantoneSwatch | undefined {
  const c = (code ?? '').trim().toLowerCase();
  if (!c) return undefined;
  return (
    PANTONE_SWATCHES.find((s) => s.code.toLowerCase() === c) ??
    PANTONE_SWATCHES.find((s) => s.code.toLowerCase().startsWith(c))
  );
}
