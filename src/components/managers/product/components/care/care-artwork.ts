// Artwork for the ISO 3758 care symbols, keyed by CODE.
//
// This file holds pictures and nothing else. The vocabulary itself — which codes exist, what they
// are called, which category they belong to, what order they print in, what a customer reads —
// comes from the backend dictionary (`GetDictionary().careSymbols`, see `care-codes.ts`). Artwork
// stays client-side because it is an asset, not data: the server has no business shipping SVG, and
// a renderer that wants a different drawing for the same code should be free to have one.
//
// The set is one family, not a collection: every symbol is drawn on the same 24x24 grid with the
// same 2px round-capped stroke. The set it replaced was assembled from four different sources and
// had five coordinate systems, seven stroke weights and one symbol filled grey instead of black —
// at 24px that read as a different icon set per category. Source and derivation are documented in
// ui/icons/care/README.md.
//
// A code the dictionary offers but this map has no picture for still renders (as its code alone),
// and a picture here for a code the dictionary no longer offers is simply never asked for. Neither
// is a failure, which is why this map is allowed to lag the vocabulary.

import BA from 'ui/icons/care/BA.svg';
import DCAS from 'ui/icons/care/DCAS.svg';
import DCASE from 'ui/icons/care/DCASE.svg';
import DCPS from 'ui/icons/care/DCPS.svg';
import DD from 'ui/icons/care/DD.svg';
import DDS from 'ui/icons/care/DDS.svg';
import DF from 'ui/icons/care/DF.svg';
import DFS from 'ui/icons/care/DFS.svg';
import DIS from 'ui/icons/care/DIS.svg';
import DNB from 'ui/icons/care/DNB.svg';
import DNDC from 'ui/icons/care/DNDC.svg';
import DNI from 'ui/icons/care/DNI.svg';
import DNS from 'ui/icons/care/DNS.svg';
import DNTD from 'ui/icons/care/DNTD.svg';
import DNW from 'ui/icons/care/DNW.svg';
import DNWC from 'ui/icons/care/DNWC.svg';
import GDC from 'ui/icons/care/GDC.svg';
import GPWC from 'ui/icons/care/GPWC.svg';
import GW from 'ui/icons/care/GW.svg';
import HW from 'ui/icons/care/HW.svg';
import IH from 'ui/icons/care/IH.svg';
import IL from 'ui/icons/care/IL.svg';
import IM from 'ui/icons/care/IM.svg';
import LD from 'ui/icons/care/LD.svg';
import LDS from 'ui/icons/care/LDS.svg';
import MW30 from 'ui/icons/care/MW30.svg';
import MW40 from 'ui/icons/care/MW40.svg';
import MW50 from 'ui/icons/care/MW50.svg';
import MW60 from 'ui/icons/care/MW60.svg';
import MWN from 'ui/icons/care/MWN.svg';
import NCB from 'ui/icons/care/NCB.svg';
import PWC from 'ui/icons/care/PWC.svg';
import TDH from 'ui/icons/care/TDH.svg';
import TDL from 'ui/icons/care/TDL.svg';
import TDM from 'ui/icons/care/TDM.svg';
import TDN from 'ui/icons/care/TDN.svg';
import VGDC from 'ui/icons/care/VGDC.svg';
import VGPWC from 'ui/icons/care/VGPWC.svg';
import VGW from 'ui/icons/care/VGW.svg';

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
