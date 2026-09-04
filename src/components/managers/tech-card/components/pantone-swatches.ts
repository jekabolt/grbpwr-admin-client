// A SUGGESTION LIST, NOT A DICTIONARY. The picker searches these by code and by name, but any code
// the operator types is accepted as typed («use “19-4005 TCX” as typed»): the Pantone fashion
// library runs to ~2,600 TCX references and a closed list would refuse the dyehouse's own number.
//
// `hex` is an APPROXIMATE screen rendering — a swatch to tell entries apart in a list, never a
// colour standard. Nothing downstream reads it; the stored value is the code string alone, exactly
// as `Material.pantone` and `ColorwayDevelopment.pantone` already hold it (free text).
export type PantoneSwatch = { code: string; name: string; hex: string };

export const PANTONE_SWATCHES: readonly PantoneSwatch[] = [
  // whites · creams · sands
  { code: '11-0601 TCX', name: 'Bright White', hex: '#F4F9FF' },
  { code: '11-4001 TCX', name: 'Brilliant White', hex: '#EDF1FE' },
  { code: '11-0602 TCX', name: 'Snow White', hex: '#F2F0EB' },
  { code: '11-4201 TCX', name: 'Cloud Dancer', hex: '#F0EEE9' },
  { code: '11-0105 TCX', name: 'Marshmallow', hex: '#F0EEE4' },
  { code: '13-0002 TCX', name: 'White Sand', hex: '#DFDDD7' },
  { code: '13-0000 TCX', name: 'Moonbeam', hex: '#CDCDC0' },
  { code: '12-0804 TCX', name: 'Cloud Cream', hex: '#E6DDC5' },
  { code: '13-0905 TCX', name: 'Birch', hex: '#DDD5C7' },
  { code: '13-1106 TCX', name: 'Sand Dollar', hex: '#DECDBE' },
  { code: '14-1210 TCX', name: 'Shifting Sand', hex: '#D8C0AD' },
  { code: '14-1118 TCX', name: 'Beige', hex: '#D5BA98' },
  { code: '16-1334 TCX', name: 'Tan', hex: '#B69574' },
  // browns
  { code: '17-1230 TCX', name: 'Mocha Mousse', hex: '#A47864' },
  { code: '18-1142 TCX', name: 'Leather Brown', hex: '#97572B' },
  { code: '18-1160 TCX', name: 'Sudan Brown', hex: '#AC6B29' },
  { code: '18-1248 TCX', name: 'Rust', hex: '#B55A30' },
  { code: '18-1027 TCX', name: 'Bison', hex: '#6E4F3A' },
  { code: '19-1116 TCX', name: 'Carafe', hex: '#5D473A' },
  { code: '19-1213 TCX', name: 'Shopping Bag', hex: '#5A4743' },
  { code: '19-1218 TCX', name: 'Potting Soil', hex: '#54392D' },
  { code: '19-1012 TCX', name: 'French Roast', hex: '#58423F' },
  { code: '18-1306 TCX', name: 'Iron', hex: '#736460' },
  // blacks · greys
  { code: '19-0303 TCX', name: 'Jet Black', hex: '#2D2C2F' },
  { code: '19-4006 TCX', name: 'Caviar', hex: '#292A2D' },
  { code: '19-4007 TCX', name: 'Anthracite', hex: '#28282D' },
  { code: '19-3921 TCX', name: 'Black Iris', hex: '#2B3042' },
  { code: '19-0201 TCX', name: 'Asphalt', hex: '#434447' },
  { code: '19-3906 TCX', name: 'Dark Shadow', hex: '#4A4B4D' },
  { code: '18-0201 TCX', name: 'Castlerock', hex: '#5F5E62' },
  { code: '18-3905 TCX', name: 'Excalibur', hex: '#676168' },
  { code: '17-3907 TCX', name: 'Quicksilver', hex: '#7E7D88' },
  { code: '17-5104 TCX', name: 'Ultimate Gray', hex: '#939597' },
  { code: '16-4402 TCX', name: 'Neutral Gray', hex: '#8E918F' },
  { code: '16-3801 TCX', name: 'Opal Gray', hex: '#A49E9E' },
  { code: '15-4101 TCX', name: 'High-rise', hex: '#AEB2B5' },
  { code: '14-4201 TCX', name: 'Lunar Rock', hex: '#C5C5C5' },
  { code: '14-4102 TCX', name: 'Glacier Gray', hex: '#C5C6C8' },
  { code: '12-4306 TCX', name: 'Barely Blue', hex: '#DBE1E1' },
  // blues
  { code: '19-4052 TCX', name: 'Classic Blue', hex: '#0F4C81' },
  { code: '19-4027 TCX', name: 'Estate Blue', hex: '#233658' },
  { code: '19-3933 TCX', name: 'Medieval Blue', hex: '#29304E' },
  { code: '19-4010 TCX', name: 'Total Eclipse', hex: '#2C313D' },
  { code: '19-4024 TCX', name: 'Dress Blues', hex: '#2A3244' },
  { code: '19-3920 TCX', name: 'Peacoat', hex: '#2B2E43' },
  { code: '19-4025 TCX', name: 'Mood Indigo', hex: '#353A4C' },
  { code: '19-4028 TCX', name: 'Insignia Blue', hex: '#2F3E55' },
  { code: '19-3810 TCX', name: 'Eclipse', hex: '#343148' },
  { code: '19-4150 TCX', name: 'Princess Blue', hex: '#00539C' },
  { code: '18-4140 TCX', name: 'French Blue', hex: '#0072B5' },
  { code: '18-4025 TCX', name: 'Copen Blue', hex: '#516B84' },
  { code: '17-4041 TCX', name: 'Marina', hex: '#4F84C4' },
  { code: '17-4021 TCX', name: 'Faded Denim', hex: '#798EA4' },
  { code: '16-4019 TCX', name: 'Forever Blue', hex: '#899BB8' },
  { code: '15-4020 TCX', name: 'Cerulean', hex: '#9BB7D4' },
  { code: '15-3919 TCX', name: 'Serenity', hex: '#91A8D0' },
  { code: '14-4122 TCX', name: 'Airy Blue', hex: '#92B6D5' },
  { code: '14-4318 TCX', name: 'Sky Blue', hex: '#8ABAD3' },
  // greens
  { code: '19-0417 TCX', name: 'Kombu Green', hex: '#3A4032' },
  { code: '19-0509 TCX', name: 'Rosin', hex: '#36362D' },
  { code: '19-6311 TCX', name: 'Greener Pastures', hex: '#37503D' },
  { code: '18-0135 TCX', name: 'Treetop', hex: '#476A30' },
  { code: '18-0117 TCX', name: 'Vineyard Green', hex: '#5F7355' },
  { code: '18-0426 TCX', name: 'Capulet Olive', hex: '#656344' },
  { code: '18-0525 TCX', name: 'Iguana', hex: '#818455' },
  { code: '17-0627 TCX', name: 'Dried Herb', hex: '#847A59' },
  { code: '16-0632 TCX', name: 'Willow', hex: '#9A8B4F' },
  { code: '17-5641 TCX', name: 'Emerald', hex: '#009473' },
  { code: '16-6340 TCX', name: 'Classic Green', hex: '#39A845' },
  { code: '17-0145 TCX', name: 'Green Flash', hex: '#79C753' },
  { code: '15-0343 TCX', name: 'Greenery', hex: '#88B04B' },
  // yellows · oranges
  { code: '13-0647 TCX', name: 'Illuminating', hex: '#F5DF4D' },
  { code: '12-0752 TCX', name: 'Buttercup', hex: '#FAE03C' },
  { code: '14-0852 TCX', name: 'Freesia', hex: '#F3C12C' },
  { code: '14-0848 TCX', name: 'Mimosa', hex: '#F0C05A' },
  { code: '16-0946 TCX', name: 'Honey', hex: '#BA9238' },
  { code: '15-0942 TCX', name: 'Sauterne', hex: '#C5A253' },
  { code: '15-1058 TCX', name: 'Radiant Yellow', hex: '#FC9E21' },
  { code: '16-1364 TCX', name: 'Vibrant Orange', hex: '#FF7420' },
  { code: '16-1462 TCX', name: 'Golden Poppy', hex: '#F56733' },
  { code: '17-1463 TCX', name: 'Tangerine Tango', hex: '#DD4124' },
  { code: '13-1023 TCX', name: 'Peach Fuzz', hex: '#FFBE98' },
  { code: '16-1546 TCX', name: 'Living Coral', hex: '#FF6F61' },
  // reds
  { code: '18-1664 TCX', name: 'Fiery Red', hex: '#D01C1F' },
  { code: '19-1664 TCX', name: 'True Red', hex: '#BF1932' },
  { code: '18-1662 TCX', name: 'Flame Scarlet', hex: '#CD212A' },
  { code: '18-1763 TCX', name: 'High Risk Red', hex: '#C71F2D' },
  { code: '19-1763 TCX', name: 'Racing Red', hex: '#BD162C' },
  { code: '18-1655 TCX', name: 'Mars Red', hex: '#BC2731' },
  { code: '19-1663 TCX', name: 'Ribbon Red', hex: '#B92636' },
  { code: '19-1557 TCX', name: 'Chili Pepper', hex: '#9B1B30' },
  { code: '19-1862 TCX', name: 'Jester Red', hex: '#9E1030' },
  { code: '19-1543 TCX', name: 'Brick Red', hex: '#8C3730' },
  { code: '18-1434 TCX', name: 'Etruscan Red', hex: '#A2574B' },
  { code: '18-1438 TCX', name: 'Marsala', hex: '#955251' },
  { code: '19-1533 TCX', name: 'Cowhide', hex: '#884344' },
  // pinks · magentas
  { code: '12-1706 TCX', name: 'Pink Dogwood', hex: '#F7D1D1' },
  { code: '13-1520 TCX', name: 'Rose Quartz', hex: '#F7CAC9' },
  { code: '13-2808 TCX', name: 'Ballet Slipper', hex: '#EBBED3' },
  { code: '14-2311 TCX', name: 'Prism Pink', hex: '#F0A1BF' },
  { code: '17-1937 TCX', name: 'Hot Pink', hex: '#E55982' },
  { code: '17-2031 TCX', name: 'Fuchsia Rose', hex: '#C74375' },
  { code: '18-2140 TCX', name: 'Cabaret', hex: '#CB3373' },
  { code: '18-1750 TCX', name: 'Viva Magenta', hex: '#BB2649' },
  { code: '19-2024 TCX', name: 'Rhododendron', hex: '#722B3F' },
  { code: '19-1627 TCX', name: 'Port Royale', hex: '#502B33' },
  { code: '19-2620 TCX', name: 'Winetasting', hex: '#492A34' },
  // purples · violets
  { code: '13-3820 TCX', name: 'Lavender Fog', hex: '#D2C4D6' },
  { code: '15-3817 TCX', name: 'Lavender', hex: '#AFA4CE' },
  { code: '16-3520 TCX', name: 'African Violet', hex: '#B085B7' },
  { code: '17-3938 TCX', name: 'Very Peri', hex: '#6667AB' },
  { code: '18-3224 TCX', name: 'Radiant Orchid', hex: '#AD5E99' },
  { code: '18-3025 TCX', name: 'Striking Purple', hex: '#944E87' },
  { code: '18-3838 TCX', name: 'Ultra Violet', hex: '#5F4B8B' },
  { code: '19-3438 TCX', name: 'Bright Violet', hex: '#784384' },
  { code: '19-3325 TCX', name: 'Wood Violet', hex: '#75406A' },
  { code: '19-3542 TCX', name: 'Pansy', hex: '#653D7C' },
  { code: '19-3632 TCX', name: 'Petunia', hex: '#4F3466' },
];

/** Looks like a Pantone reference the operator typed rather than a search word: «19-4005», «19-4005 TCX». */
export const PANTONE_CODE_RE = /^\s*\d{2}-\d{4}(\s*(TCX|TPG|TPX|TN|TSX))?\s*$/i;

/** Case-insensitive, «19 4005» and «19-4005» both find the swatch; a name word finds by name. */
export function searchPantone(query: string, limit = 24): PantoneSwatch[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return PANTONE_SWATCHES.slice(0, limit);
  const qCode = q.replace(/\s/g, '-');
  const hits = PANTONE_SWATCHES.filter(
    (s) =>
      s.code.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(qCode) ||
      s.name.toLowerCase().includes(q),
  );
  return hits.slice(0, limit);
}

/** The swatch behind a stored code, for the colour square next to a value. Unknown codes get none. */
export function findPantone(code?: string): PantoneSwatch | undefined {
  const c = (code ?? '').trim().toLowerCase();
  if (!c) return undefined;
  return PANTONE_SWATCHES.find((s) => s.code.toLowerCase() === c || s.code.toLowerCase().startsWith(c));
}
