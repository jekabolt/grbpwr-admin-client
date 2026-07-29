// Care instructions as ISO-style laundry SYMBOLS.
//
// The artwork is one family, not a collection: every symbol is drawn on the same
// 24x24 grid with the same 2px round-capped stroke. The set it replaced was
// assembled from four different sources and had five coordinate systems, seven
// stroke weights and one symbol filled grey instead of black — at 24px that read
// as a different icon set per category.
//
// Source and derivation are documented in ui/icons/care/README.md. The CODE is
// what is authoritative here: it is what gets stored and what prints on the sewn
// tag. The picture is the affordance that lets a person find the code.

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

export const careInstruction = {
  care_instructions: {
    Washing: {
      'Machine Wash Normal': { code: 'MWN', img: MWN },
      'Machine Wash Cold (30°C)': { code: 'MW30', img: MW30 },
      'Machine Wash Warm (40°C)': { code: 'MW40', img: MW40 },
      'Machine Wash Hot (50°C)': { code: 'MW50', img: MW50 },
      'Machine Wash Very Hot (60°C)': { code: 'MW60', img: MW60 },
      'Gentle Wash': { code: 'GW', img: GW },
      'Very Gentle Wash': { code: 'VGW', img: VGW },
      'Hand Wash Only': { code: 'HW', img: HW },
      'Do Not Wash': { code: 'DNW', img: DNW },
    },
    Bleaching: {
      'Bleach Allowed': { code: 'BA', img: BA },
      'Non-Chlorine Bleach Only': { code: 'NCB', img: NCB },
      'Do Not Bleach': { code: 'DNB', img: DNB },
    },
    Drying: {
      'Tumble Dry Normal': { code: 'TDN', img: TDN },
      'Tumble Dry Low Heat': { code: 'TDL', img: TDL },
      'Tumble Dry Medium Heat': { code: 'TDM', img: TDM },
      'Tumble Dry High Heat': { code: 'TDH', img: TDH },
      'Do Not Tumble Dry': { code: 'DNTD', img: DNTD },
      'Line Dry': { code: 'LD', img: LD },
      'Dry Flat': { code: 'DF', img: DF },
      'Drip Dry': { code: 'DD', img: DD },
      'Dry in Shade': { code: 'DIS', img: DIS },
      'Line Dry in Shade': { code: 'LDS', img: LDS },
      'Dry Flat in Shade': { code: 'DFS', img: DFS },
      'Drip Dry in Shade': { code: 'DDS', img: DDS },
    },
    Ironing: {
      'Iron at Low Temperature (110°C)': { code: 'IL', img: IL },
      'Iron at Medium Temperature (150°C)': { code: 'IM', img: IM },
      'Iron at High Temperature (200°C)': { code: 'IH', img: IH },
      'Do Not Steam': { code: 'DNS', img: DNS },
      'Do Not Iron': { code: 'DNI', img: DNI },
    },
    'Professional Care': {
      'Dry Cleaning': {
        'Dry Clean with Any Solvent': { code: 'DCAS', img: DCAS },
        'Dry Clean with Petroleum Solvent Only': { code: 'DCPS', img: DCPS },
        'Dry Clean with Any Solvent Except Trichloroethylene': { code: 'DCASE', img: DCASE },
        'Gentle Dry Clean with Any Solvent Except Trichloroethylene': { code: 'GDC', img: GDC },
        'Very Gentle Dry Clean with Any Solvent Except Trichloroethylene': { code: 'VGDC', img: VGDC },
        'Do Not Dry Clean': { code: 'DNDC', img: DNDC },
      },
      'Wet Cleaning': {
        'Professional Wet Clean': { code: 'PWC', img: PWC },
        'Gentle Professional Wet Clean': { code: 'GPWC', img: GPWC },
        'Very Gentle Professional Wet Clean': { code: 'VGPWC', img: VGPWC },
        'Do Not Wet Clean': { code: 'DNWC', img: DNWC },
      },
    },
  },
};
