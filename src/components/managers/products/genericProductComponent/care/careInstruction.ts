import BA from 'ui/icons/laundrySymbols/bleaching/Bleichen.svg';
import DNB from 'ui/icons/laundrySymbols/bleaching/Nicht_bleichen_v2.svg';
import NCB from 'ui/icons/laundrySymbols/bleaching/Sauerstoffbleichen.svg';
import DNTD from 'ui/icons/laundrySymbols/drying/Chem_nein.svg';
import TDH from 'ui/icons/laundrySymbols/drying/laundry-tumble-dry-high-temperature-icon.svg';
import LD from 'ui/icons/laundrySymbols/drying/Trocknen_(leine).svg';
import LDS from 'ui/icons/laundrySymbols/drying/Trocknen_(leine_im_schatten).svg';
import DF from 'ui/icons/laundrySymbols/drying/Trocknen_(liegend).svg';
import DFS from 'ui/icons/laundrySymbols/drying/Trocknen_(liegend_im_schatten).svg';
import DIS from 'ui/icons/laundrySymbols/drying/Trocknen_(schatten).svg';
import DD from 'ui/icons/laundrySymbols/drying/Trocknen_(tropfnass).svg';
import DDS from 'ui/icons/laundrySymbols/drying/Trocknen_(tropfnass_im_schatten).svg';
import TDM from 'ui/icons/laundrySymbols/drying/Trockner_hohe_Temperatur.svg';
import TDL from 'ui/icons/laundrySymbols/drying/Trockner_wenig_Temperatur.svg';
import TDN from 'ui/icons/laundrySymbols/drying/Trommeltrocknen.svg';
import IL from 'ui/icons/laundrySymbols/ironing/Bügeln_1.svg';
import IM from 'ui/icons/laundrySymbols/ironing/Bügeln_2.svg';
import IH from 'ui/icons/laundrySymbols/ironing/Bügeln_3.svg';
import DNS from 'ui/icons/laundrySymbols/ironing/laundry-iron-do-not-steam-icon.svg';
import DNI from 'ui/icons/laundrySymbols/ironing/Nicht_bügeln.svg';
import DCAS from 'ui/icons/laundrySymbols/professional-care/dry/0596f341-6ef0-4c83-b0a4-cd2cc052ab5b.svg';
import DNDC from 'ui/icons/laundrySymbols/professional-care/dry/Nicht_chemisch_reinigen.svg';
import DCPS from 'ui/icons/laundrySymbols/professional-care/dry/Professionelle_reinigung_(F).svg';
import DCASE from 'ui/icons/laundrySymbols/professional-care/dry/Professionelle_reinigung_(P).svg';
import GDC from 'ui/icons/laundrySymbols/professional-care/dry/Professionelle_reinigung_(P)s.svg';
import VGDC from 'ui/icons/laundrySymbols/professional-care/dry/Professionelle_reinigung_(P)ss.svg';
import PWC from 'ui/icons/laundrySymbols/professional-care/wet/Professionelle_reinigung_(W).svg';
import GPWC from 'ui/icons/laundrySymbols/professional-care/wet/Professionelle_reinigung_(W)s.svg';
import VGPWC from 'ui/icons/laundrySymbols/professional-care/wet/Professionelle_reinigung_(W)ss.svg';
import DNWC from 'ui/icons/laundrySymbols/professional-care/wet/Мокрая_чистка_запрещена.svg';
import HW from 'ui/icons/laundrySymbols/washing/Handwäsche.svg';
import MW95 from 'ui/icons/laundrySymbols/washing/ISO_7000_-_Ref-No_3097.svg';
import GW from 'ui/icons/laundrySymbols/washing/Laundry_symbol_wash_delicate.svg';
import VGW from 'ui/icons/laundrySymbols/washing/Laundry_symbol_wash_very_delicate.svg';
import DNW from 'ui/icons/laundrySymbols/washing/Nicht_waschen.svg';
import MWN from 'ui/icons/laundrySymbols/washing/Waschen.svg';
import MW30 from 'ui/icons/laundrySymbols/washing/Waschen_30 (1).svg';
import MW40 from 'ui/icons/laundrySymbols/washing/Waschen_40.svg';
import MW50 from 'ui/icons/laundrySymbols/washing/Waschen_50.svg';
import MW60 from 'ui/icons/laundrySymbols/washing/Waschen_60.svg';

export const careInstruction = {
    "care_instructions": {
        "Washing": {
            "Machine Wash Normal": { code: "MWN", img: MWN },
            "Machine Wash Cold (30°C)": { code: "MW30", img: MW30 },
            "Machine Wash Warm (40°C)": { code: "MW40", img: MW40 },
            "Machine Wash Hot (50°C)": { code: "MW50", img: MW50 },
            "Machine Wash Very Hot (60°C)": { code: "MW60", img: MW60 },
            "Machine Wash Boiling (95°C)": { code: "MW95", img: MW95 },
            "Gentle Wash": { code: "GW", img: GW },
            "Very Gentle Wash": { code: "VGW", img: VGW },
            "Hand Wash Only": { code: "HW", img: HW },
            "Do Not Wash": { code: "DNW", img: DNW }
        },
        "Bleaching": {
            "Bleach Allowed": { code: "BA", img: BA },
            "Non-Chlorine Bleach Only": { code: "NCB", img: NCB },
            "Do Not Bleach": { code: "DNB", img: DNB }
        },
        "Drying": {
            "Tumble Dry Normal": { code: "TDN", img: TDN },
            "Tumble Dry Low Heat": { code: "TDL", img: TDL },
            "Tumble Dry Medium Heat": { code: "TDM", img: TDM },
            "Tumble Dry High Heat": { code: "TDH", img: TDH },
            "Do Not Tumble Dry": { code: "DNTD", img: DNTD },
            "Line Dry": { code: "LD", img: LD },
            "Dry Flat": { code: "DF", img: DF },
            "Drip Dry": { code: "DD", img: DD },
            "Dry in Shade": { code: "DIS", img: DIS },
            "Line Dry in Shade": { code: "LDS", img: LDS },
            "Dry Flat in Shade": { code: "DFS", img: DFS },
            "Drip Dry in Shade": { code: "DDS", img: DDS }
        },
        "Ironing": {
            "Iron at Low Temperature (110°C)": { code: "IL", img: IL },
            "Iron at Medium Temperature (150°C)": { code: "IM", img: IM },
            "Iron at High Temperature (200°C)": { code: "IH", img: IH },
            "Do Not Steam": { code: "DNS", img: DNS },
            "Do Not Iron": { code: "DNI", img: DNI }
        },
        "Professional Care": {
            "Dry Cleaning": {
                "Dry Clean with Any Solvent": { code: "DCAS", img: DCAS },
                "Dry Clean with Petroleum Solvent Only": { code: "DCPS", img: DCPS },
                "Dry Clean with Any Solvent Except Trichloroethylene": { code: "DCASE", img: DCASE },
                "Gentle Dry Clean with Any Solvent Except Trichloroethylene": { code: "GDC", img: GDC },
                "Very Gentle Dry Clean with Any Solvent Except Trichloroethylene": { code: "VGDC", img: VGDC },
                "Do Not Dry Clean": { code: "DNDC", img: DNDC }
            },
            "Wet Cleaning": {
                "Professional Wet Clean": { code: "PWC", img: PWC },
                "Gentle Professional Wet Clean": { code: "GPWC", img: GPWC },
                "Very Gentle Professional Wet Clean": { code: "VGPWC", img: VGPWC },
                "Do Not Wet Clean": { code: "DNWC", img: DNWC }
            }
        }
    },
};
