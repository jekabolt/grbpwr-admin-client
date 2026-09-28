// ФИКСТУРА МАКЕТА ВЛАДЕЛЬЦА — те же данные, что на четырёх макетах (`care-face-main`,
// `care-back-meta`, `care-face-composition`, `care-back-composition`): пробы раскладки/PDF сверяют
// по ней геометрию с макетом, экран может показать её как пример.
//
// Строки состава — ТЕКСТ МАКЕТА как есть (в т. ч. `COW LEATHER`, которого нет в словаре волокон):
// это эталон картинки, а не данные для печати. Настоящие строки делает резолвер из словаря.
import type { PartComposition } from '../composition-resolver';
import type { PrintedPart } from '../label-parts';
import { NON_TEXTILE_ANIMAL_PHRASE, type LabelLang } from '../phrases';
import type { AFaceInput, ABackInput } from '../layout';

export const MOCKUP_A_FACE: AFaceInput = {
  sku: 'RC27-99999-OFW-76',
  colour: 'Black',
  size: 'XL',
  care: {
    codes: ['VGW', 'NCB', 'DFS', 'DNI', 'VGDC', 'VGPWC'],
    prose: [
      'Very gentle wash',
      'Non-chlorine bleach only',
      'Dry flat in shade',
      'Do not iron',
      'Very gentle dry clean',
      'Very gentle professional wet clean',
    ],
  },
  country: 'Poland',
};

export const MOCKUP_A_BACK: ABackInput = { url: 'https://grbpwr.com/p/rc27-99999-ofw' };

type Rows = Record<LabelLang, string>;

const COTTON_100: Rows = {
  en: '100% COTTON',
  fr: '100% COTON',
  de: '100% BAUMWOLLE',
  it: '100% COTONE',
  es: '100% ALGODÓN',
  pt: '100% ALGODÃO',
  nl: '100% KATOEN',
  pl: '100% BAWEŁNA',
  cn: '100% 棉',
  jp: '100% 綿',
};

const SHELL: Rows = {
  en: '55% COTTON  35% LINEN  10% POLYAMIDE',
  fr: '55% COTON  35% LIN  10% POLYAMIDE',
  de: '55% BAUMWOLLE  35% LEINEN  10% POLYAMID',
  it: '55% COTONE  35% LINO  10% POLIAMMIDE',
  es: '55% ALGODÓN  35% LINO  10% POLIAMIDA',
  pt: '55% ALGODÃO  35% LINHO  10% POLIAMIDA',
  nl: '55% KATOEN  35% LINNEN  10% POLYAMIDE',
  pl: '55% BAWEŁNA  35% LEN  10% POLIAMID',
  cn: '55% 棉  35% 亚麻  10% 锦纶',
  jp: '55% 綿  35% 麻  10% ポリアミド',
};

const SLEEVE: Rows = {
  en: '55% POLYESTER  45% VISCOSE',
  fr: '55% POLYESTER  45% VISCOSE',
  de: '55% POLYESTER  45% VISKOSE',
  it: '55% POLIESTERE  45% VISCOSA',
  es: '55% POLIÉSTER  45% VISCOSA',
  pt: '55% POLIÉSTER  45% VISCOSE',
  nl: '55% POLYESTER  45% VISCOSE',
  pl: '55% POLIESTER  45% WISKOZA',
  cn: '55% 聚酯纤维  45% 粘纤',
  jp: '55% ポリエステル  45% レーヨン',
};

const TRIM: Rows = {
  en: '100% COW LEATHER',
  fr: '100% CUIR DE VACHE',
  de: '100% RINDSLEDER',
  it: '100% PELLE BOVINA',
  es: '100% PIEL DE VACUNO',
  pt: '100% COURO BOVINO',
  nl: '100% RUNDLEER',
  pl: '100% SKÓRA BYDLĘCA',
  cn: '100% 牛皮',
  jp: '100% 牛革',
};

const part = (
  p: PrintedPart,
  rows: Rows,
  fibers: [string, number][],
  animal = false,
): PartComposition => ({
  part: p,
  fibers: fibers.map(([code, percent]) => ({ code, percent })),
  animal,
  rows,
  lineKeys: [`mockup-${p.toLowerCase()}`],
});

/** Пять частей макета в порядке `LABEL_PARTS`. */
export const MOCKUP_PARTS: PartComposition[] = [
  part('SHELL', SHELL, [
    ['COT', 55],
    ['LIN', 35],
    ['NYL', 10],
  ]),
  part('BODY_LINING', COTTON_100, [['COT', 100]]),
  part('SLEEVE_LINING', SLEEVE, [
    ['POL', 55],
    ['VIS', 45],
  ]),
  part('POCKET_LINING', COTTON_100, [['COT', 100]]),
  part('TRIM', TRIM, [['LEA', 100]], true),
];

/** Перелив: пять частей + NOTE (фраза ст. 12) → три стороны, вторая этикетка B2. */
export const OVERFLOW_PARTS: PartComposition[] = [
  ...MOCKUP_PARTS,
  part('NOTE', { ...NON_TEXTILE_ANIMAL_PHRASE }, []),
];

/** Колонка шире стороны: 9 волокон в одной части → `part-too-wide`. */
export const TOO_WIDE_PARTS: PartComposition[] = [
  part(
    'SHELL',
    Object.fromEntries(
      Object.entries(SHELL).map(([lang, s]) => [lang, `${s}  ${s}  ${s}`]),
    ) as Rows,
    [['COT', 100]],
  ),
];
