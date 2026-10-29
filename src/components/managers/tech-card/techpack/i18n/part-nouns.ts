import type { PdfLang, PdfLocale } from './langs';
import { pdfLocaleOf, type PdfT } from './translate';

export type PartNounId =
  | 'facing'
  | 'cuff'
  | 'hemband'
  | 'waistband'
  | 'loop'
  | 'rib'
  | 'stand'
  | 'collar'
  | 'hood'
  | 'pocket'
  | 'placket'
  | 'fly'
  | 'skirt'
  | 'yoke'
  | 'front'
  | 'back'
  | 'side'
  | 'sleeve'
  | 'neckline'
  | 'sleeveCap'
  | 'armhole'
  | 'piece';

type Forms = readonly [
  nominativeOne: string,
  genitiveOne: string,
  nominativeMany: string,
  genitiveMany: string,
];
type Nouns = Readonly<Record<PartNounId, Forms>>;

const same = (one: string, many: string): Forms => [one, one, many, many];
const invariant = (word: string): Forms => [word, word, word, word];

/** Workshop nouns. Russian stores the grammatical case explicitly; other locales keep their `than` form. */
const NOUNS: Readonly<Record<PdfLang, Nouns>> = {
  en: {
    facing: same('facing', 'facings'),
    cuff: same('cuff', 'cuffs'),
    hemband: same('hem band', 'hem bands'),
    waistband: same('waistband', 'waistbands'),
    loop: same('belt loop', 'belt loops'),
    rib: same('rib', 'ribs'),
    stand: same('stand', 'stands'),
    collar: same('collar', 'collars'),
    hood: same('hood', 'hoods'),
    pocket: same('pocket', 'pockets'),
    placket: same('placket', 'plackets'),
    fly: same('fly', 'flies'),
    skirt: same('skirt', 'skirts'),
    yoke: same('yoke', 'yokes'),
    front: same('front', 'fronts'),
    back: same('back', 'backs'),
    side: same('side panel', 'side panels'),
    sleeve: same('sleeve', 'sleeves'),
    neckline: same('neckline', 'necklines'),
    sleeveCap: same('sleeve cap', 'sleeve caps'),
    armhole: same('armhole', 'armholes'),
    piece: same('piece', 'pieces'),
  },
  fr: {
    facing: same('parementure', 'parementures'),
    cuff: same('poignet', 'poignets'),
    hemband: same('bande de bas', 'bandes de bas'),
    waistband: same('ceinture', 'ceintures'),
    loop: same('passant', 'passants'),
    rib: same('bord-côte', 'bords-côtes'),
    stand: same('pied de col', 'pieds de col'),
    collar: same('col', 'cols'),
    hood: same('capuche', 'capuches'),
    pocket: same('poche', 'poches'),
    placket: same('patte', 'pattes'),
    fly: same('braguette', 'braguettes'),
    skirt: same('jupe', 'jupes'),
    yoke: same('empiècement', 'empiècements'),
    front: same('devant', 'devants'),
    back: same('dos', 'dos'),
    side: same('côté', 'côtés'),
    sleeve: same('manche', 'manches'),
    neckline: same('encolure', 'encolures'),
    sleeveCap: same('tête de manche', 'têtes de manche'),
    armhole: same('emmanchure', 'emmanchures'),
    piece: same('pièce', 'pièces'),
  },
  de: {
    facing: same('Beleg', 'Belege'),
    cuff: same('Manschette', 'Manschetten'),
    hemband: same('Saumbund', 'Saumbünde'),
    waistband: same('Bund', 'Bünde'),
    loop: same('Gürtelschlaufe', 'Gürtelschlaufen'),
    rib: same('Rippe', 'Rippen'),
    stand: same('Kragensteg', 'Kragenstege'),
    collar: same('Kragen', 'Kragen'),
    hood: same('Kapuze', 'Kapuzen'),
    pocket: same('Tasche', 'Taschen'),
    placket: same('Leiste', 'Leisten'),
    fly: same('Hosenschlitz', 'Hosenschlitze'),
    skirt: same('Rock', 'Röcke'),
    yoke: same('Passe', 'Passen'),
    front: same('Vorderteil', 'Vorderteile'),
    back: same('Rückenteil', 'Rückenteile'),
    side: same('Seitenteil', 'Seitenteile'),
    sleeve: same('Ärmel', 'Ärmel'),
    neckline: same('Halsausschnitt', 'Halsausschnitte'),
    sleeveCap: same('Ärmelkugel', 'Ärmelkugeln'),
    armhole: same('Armloch', 'Armlöcher'),
    piece: same('Teil', 'Teile'),
  },
  it: {
    facing: same('paramontura', 'paramonture'),
    cuff: same('polsino', 'polsini'),
    hemband: same('fascia fondo', 'fasce fondo'),
    waistband: same('cintura', 'cinture'),
    loop: same('passante', 'passanti'),
    rib: same('costina', 'costine'),
    stand: same('solino', 'solini'),
    collar: same('collo', 'colli'),
    hood: same('cappuccio', 'cappucci'),
    pocket: same('tasca', 'tasche'),
    placket: same('finta', 'finte'),
    fly: same('patta', 'patte'),
    skirt: same('gonna', 'gonne'),
    yoke: same('sprone', 'sproni'),
    front: same('davanti', 'davanti'),
    back: same('dietro', 'dietri'),
    side: same('fianco', 'fianchi'),
    sleeve: same('manica', 'maniche'),
    neckline: same('scollatura', 'scollature'),
    sleeveCap: same('colmo manica', 'colmi manica'),
    armhole: same('giro manica', 'giri manica'),
    piece: same('pezzo', 'pezzi'),
  },
  es: {
    facing: same('vista', 'vistas'),
    cuff: same('puño', 'puños'),
    hemband: same('banda de bajo', 'bandas de bajo'),
    waistband: same('cinturilla', 'cinturillas'),
    loop: same('trabilla', 'trabillas'),
    rib: same('canalé', 'canalés'),
    stand: same('pie de cuello', 'pies de cuello'),
    collar: same('cuello', 'cuellos'),
    hood: same('capucha', 'capuchas'),
    pocket: same('bolsillo', 'bolsillos'),
    placket: same('tapeta', 'tapetas'),
    fly: same('bragueta', 'braguetas'),
    skirt: same('falda', 'faldas'),
    yoke: same('canesú', 'canesús'),
    front: same('delantero', 'delanteros'),
    back: same('espalda', 'espaldas'),
    side: same('costadillo', 'costadillos'),
    sleeve: same('manga', 'mangas'),
    neckline: same('escote', 'escotes'),
    sleeveCap: same('copa de manga', 'copas de manga'),
    armhole: same('sisa', 'sisas'),
    piece: same('pieza', 'piezas'),
  },
  pl: {
    facing: same('odszycie', 'odszycia'),
    cuff: same('mankiet', 'mankiety'),
    hemband: same('pas dołu', 'pasy dołu'),
    waistband: same('pasek', 'paski'),
    loop: same('szlufka', 'szlufki'),
    rib: same('ściągacz', 'ściągacze'),
    stand: same('stójka', 'stójki'),
    collar: same('kołnierz', 'kołnierze'),
    hood: same('kaptur', 'kaptury'),
    pocket: same('kieszeń', 'kieszenie'),
    placket: same('listwa', 'listwy'),
    fly: same('rozporek', 'rozporki'),
    skirt: same('spódnica', 'spódnice'),
    yoke: same('karczek', 'karczki'),
    front: same('przód', 'przody'),
    back: same('tył', 'tyły'),
    side: same('bok', 'boki'),
    sleeve: same('rękaw', 'rękawy'),
    neckline: same('dekolt', 'dekolty'),
    sleeveCap: same('główka rękawa', 'główki rękawa'),
    armhole: same('pacha', 'pachy'),
    piece: same('element', 'elementy'),
  },
  ru: {
    facing: ['обтачка', 'обтачки', 'обтачки', 'обтачек'],
    cuff: ['манжета', 'манжеты', 'манжеты', 'манжет'],
    hemband: ['пояс низа', 'пояса низа', 'пояса низа', 'поясов низа'],
    waistband: ['пояс', 'пояса', 'пояса', 'поясов'],
    loop: ['шлёвка', 'шлёвки', 'шлёвки', 'шлёвок'],
    rib: ['бейка', 'бейки', 'бейки', 'беек'],
    stand: ['стойка', 'стойки', 'стойки', 'стоек'],
    collar: ['воротник', 'воротника', 'воротники', 'воротников'],
    hood: ['капюшон', 'капюшона', 'капюшоны', 'капюшонов'],
    pocket: ['карман', 'кармана', 'карманы', 'карманов'],
    placket: ['планка', 'планки', 'планки', 'планок'],
    fly: ['гульфик', 'гульфика', 'гульфики', 'гульфиков'],
    skirt: ['юбка', 'юбки', 'юбки', 'юбок'],
    yoke: ['кокетка', 'кокетки', 'кокетки', 'кокеток'],
    front: ['полочка', 'полочки', 'полочки', 'полочек'],
    back: ['спинка', 'спинки', 'спинки', 'спинок'],
    side: ['бочок', 'бочка', 'бочки', 'бочков'],
    sleeve: ['рукав', 'рукава', 'рукава', 'рукавов'],
    neckline: ['горловина', 'горловины', 'горловины', 'горловин'],
    sleeveCap: ['окат', 'оката', 'окаты', 'окатов'],
    armhole: ['пройма', 'проймы', 'проймы', 'пройм'],
    piece: ['деталь', 'детали', 'детали', 'деталей'],
  },
  cn: {
    facing: invariant('贴边'),
    cuff: invariant('袖口'),
    hemband: invariant('下摆罗纹'),
    waistband: invariant('腰头'),
    loop: invariant('裤袢'),
    rib: invariant('罗纹'),
    stand: invariant('领座'),
    collar: invariant('衣领'),
    hood: invariant('帽片'),
    pocket: invariant('口袋'),
    placket: invariant('门襟'),
    fly: invariant('裤门襟'),
    skirt: invariant('裙片'),
    yoke: invariant('育克'),
    front: invariant('前片'),
    back: invariant('后片'),
    side: invariant('侧片'),
    sleeve: invariant('袖片'),
    neckline: invariant('领口'),
    sleeveCap: invariant('袖山'),
    armhole: invariant('袖窿'),
    piece: invariant('裁片'),
  },
  ja: {
    facing: invariant('見返し'),
    cuff: invariant('カフス'),
    hemband: invariant('裾リブ'),
    waistband: invariant('ウエストベルト'),
    loop: invariant('ベルトループ'),
    rib: invariant('リブ'),
    stand: invariant('台衿'),
    collar: invariant('衿'),
    hood: invariant('フード'),
    pocket: invariant('ポケット'),
    placket: invariant('前立て'),
    fly: invariant('持ち出し'),
    skirt: invariant('スカート'),
    yoke: invariant('ヨーク'),
    front: invariant('前身頃'),
    back: invariant('後身頃'),
    side: invariant('脇パネル'),
    sleeve: invariant('袖'),
    neckline: invariant('衿ぐり'),
    sleeveCap: invariant('袖山'),
    armhole: invariant('アームホール'),
    piece: invariant('パーツ'),
  },
  kr: {
    facing: invariant('안단'),
    cuff: invariant('커프스'),
    hemband: invariant('밑단 밴드'),
    waistband: invariant('허리 밴드'),
    loop: invariant('벨트 고리'),
    rib: invariant('시보리'),
    stand: invariant('칼라 스탠드'),
    collar: invariant('칼라'),
    hood: invariant('후드'),
    pocket: invariant('포켓'),
    placket: invariant('플래킷'),
    fly: invariant('지퍼 덧단'),
    skirt: invariant('스커트'),
    yoke: invariant('요크'),
    front: invariant('앞판'),
    back: invariant('뒤판'),
    side: invariant('옆판'),
    sleeve: invariant('소매'),
    neckline: invariant('목둘레'),
    sleeveCap: invariant('소매산'),
    armhole: invariant('암홀'),
    piece: invariant('재단물'),
  },
};

const localeKey = (locale: PdfLocale): PdfLang => (locale === 'xx' ? 'en' : locale);

export type PartNoun = { nominative: string; genitive: string };

export function partNoun(id: PartNounId, count: number, translate: PdfT): PartNoun {
  const forms = NOUNS[localeKey(pdfLocaleOf(translate))][id];
  const many = count > 1;
  return {
    nominative: forms[many ? 2 : 0],
    genitive: forms[many ? 3 : 1],
  };
}
