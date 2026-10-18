// Artwork for the ISO 3758 care symbols, keyed by CODE.
//
// This file holds pictures and nothing else. The vocabulary itself — which codes exist, what they
// are called, which category they belong to, what order they print in, what a customer reads —
// comes from the backend dictionary (`GetDictionary().careSymbols`, see `care-codes.ts`). Artwork
// stays client-side because it is an asset, not data: the server has no business shipping SVG, and
// a renderer that wants a different drawing for the same code should be free to have one.
//
// The set is one family, not a collection: the brand's own care iconset, every symbol drawn on the
// same 108x108 grid in solid black at one line weight. The code→file mapping and the parts of the
// delivery that are deliberately not used are documented in ui/icons/care/README.md.
//
// A code the dictionary offers but this map has no picture for still renders (as its code alone),
// and a picture here for a code the dictionary no longer offers is simply never asked for. Neither
// is a failure, which is why this map is allowed to lag the vocabulary.

import BA from 'components/shared/care-icons/BA.svg';
import DCAS from 'components/shared/care-icons/DCAS.svg';
import DCASE from 'components/shared/care-icons/DCASE.svg';
import DCPS from 'components/shared/care-icons/DCPS.svg';
import DD from 'components/shared/care-icons/DD.svg';
import DDS from 'components/shared/care-icons/DDS.svg';
import DF from 'components/shared/care-icons/DF.svg';
import DFS from 'components/shared/care-icons/DFS.svg';
import DIS from 'components/shared/care-icons/DIS.svg';
import DNB from 'components/shared/care-icons/DNB.svg';
import DNDC from 'components/shared/care-icons/DNDC.svg';
import DNI from 'components/shared/care-icons/DNI.svg';
import DNS from 'components/shared/care-icons/DNS.svg';
import DNTD from 'components/shared/care-icons/DNTD.svg';
import DNW from 'components/shared/care-icons/DNW.svg';
import DNWC from 'components/shared/care-icons/DNWC.svg';
import GDC from 'components/shared/care-icons/GDC.svg';
import GPWC from 'components/shared/care-icons/GPWC.svg';
import GW from 'components/shared/care-icons/GW.svg';
import HW from 'components/shared/care-icons/HW.svg';
import IA from 'components/shared/care-icons/IA.svg';
import IH from 'components/shared/care-icons/IH.svg';
import IL from 'components/shared/care-icons/IL.svg';
import IM from 'components/shared/care-icons/IM.svg';
import LD from 'components/shared/care-icons/LD.svg';
import LDS from 'components/shared/care-icons/LDS.svg';
import MW30 from 'components/shared/care-icons/MW30.svg';
import MW40 from 'components/shared/care-icons/MW40.svg';
import MW50 from 'components/shared/care-icons/MW50.svg';
import MW60 from 'components/shared/care-icons/MW60.svg';
import MWN from 'components/shared/care-icons/MWN.svg';
import NCB from 'components/shared/care-icons/NCB.svg';
import PWC from 'components/shared/care-icons/PWC.svg';
import TDH from 'components/shared/care-icons/TDH.svg';
import TDL from 'components/shared/care-icons/TDL.svg';
import TDM from 'components/shared/care-icons/TDM.svg';
import TDN from 'components/shared/care-icons/TDN.svg';
import VGDC from 'components/shared/care-icons/VGDC.svg';
import VGPWC from 'components/shared/care-icons/VGPWC.svg';
import VGW from 'components/shared/care-icons/VGW.svg';

export const CARE_ARTWORK: Record<string, string> = {
  MWN,
  MW30,
  MW40,
  MW50,
  MW60,
  GW,
  VGW,
  HW,
  DNW,
  BA,
  NCB,
  DNB,
  TDN,
  TDL,
  TDM,
  TDH,
  DNTD,
  LD,
  DF,
  DD,
  DIS,
  LDS,
  DFS,
  DDS,
  IA,
  IL,
  IM,
  IH,
  DNS,
  DNI,
  DCAS,
  DCPS,
  DCASE,
  GDC,
  VGDC,
  DNDC,
  PWC,
  GPWC,
  VGPWC,
  DNWC,
};
