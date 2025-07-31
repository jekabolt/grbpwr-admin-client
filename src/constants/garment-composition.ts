export const composition = {
    "garment_composition": {
        "Natural Fibers": {
            "Cotton": "COT",
            "Linen": "LIN",
            "Wool": "WOL",
            "Silk": "SIL",
            "Hemp": "HEM",
            "Ramie": "RAM",
            "Jute": "JUT",
            "Kapok": "KAP",
            "Seacell": "SEA",
            "Merino Wool": "MER",
            "Cheviot Wool": "CHE",
            "Sea Island Cotton": "SIC",
            "Yak Wool": "YAK",
            "Vicuna": "VIC",
            "Camel Hair": "CAM",
            "Angora": "ANG",
            "Mohair": "MOH",
            "Qiviut (Muskox Wool)": "QIV",
            "Mulberry Silk": "MULS",
            "Sable Fur": "SAB",
            "Zibeline": "ZIB",
        },
        "Regenerated & semi-synthetic": {
            "Rayon (Viscose)": "RAY",
            "Modal": "MOD",
            "Excel (Lyocell)": "EXC",
            "Tencel (Lyocell)": "TEN",
            "Lenzing ECOVERO": "LEV",
            "Soy Silk": "SOY"
        },
        "Technical & synthetic": {
            "Polyester": "POL",
            "Nylon": "NYL",
            "Acrylic": "ACR",
            "Spandex (Elastane)": "SPA",
            "Acetate": "ACE",
            "Polypropylene": "PP",
            "Kevlar": "KEV",
            "Neoprene": "NEO",
            "Polyurethane (PU)": "PU",
            "Gore-Tex": "GTX",
            "Ripstop": "RIP",
            "Cordura": "CORD",
            "Pertex": "PRX",
            "Coolmax": "CMX",
            "Thermolite": "THL",
            "PrimaLoft": "PRL",
            "Econyl": "ECO",
            "Recycled Polyester (rPET)": "RPET",
        },
        "Animal-derived": { "Leather": "LEA" },
        "Blends (natural + synthetic)": {
            "Cotton-Polyester": "COT-POL",
            "Cotton-Viscose": "COT-VIS",
            "Cotton-Modal": "COT-MOD",
            "Cotton-Excel (Lyocell)": "COT-EXC",
            "Linen-Cotton": "LIN-COT",
            "Linen-Viscose": "LIN-VIS",
            "Linen-Silk": "LIN-SIL",
            "Bamboo-Cotton": "BAM-COT",
            "Wool-Synthetic Blend": "WOL-SYN",
            "Wool-Silk": "WOL-SIL",
            "Wool-Linen": "WOL-LIN",
            "Silk-Cotton": "SIL-COT",
            "Silk-Viscose": "SIL-VIS",
            "Silk-Wool": "SIL-WOL",
            "Silk-Modal": "SIL-MOD",
            "Merino Wool Blends": "MER-BLD",
            "Lycra Blends": "LYC-BLD",
            "Nylon-Cotton": "NYL-COT",
            "Nylon-Natural Fiber Blend": "NYL-NAT",
            "Polyester-Cotton": "POL-COT",
            "Polyester-Viscose": "POL-VIS",
            "Organic Cotton": "OCOT",
            "Recycled Wool": "RWOL",
        },
        "High-Performance Fibers": {
            "Gore-Tex": "GTX",
            "Ripstop": "RIP",
            "Cordura": "CORD",
            "Merino Wool": "MER",
            "Pertex": "PRX",
            "Coolmax": "CMX",
            "Thermolite": "THL",
            "PrimaLoft": "PRL"
        },
        "Hardware / Trims (expanded)": {
            "Corozo": "COR",
            "Horn": "HOR",
            "Metal Hardware (General)": "MET",
            "Brass": "BRS",
            "Stainless Steel": "STS",
            "Aluminium": "ALU",
            "Nickel": "NIK",
            "Copper": "COP",
            "Silver": "SILV",
            "Gold": "GOLD",
            "Mother of Pearl": "MOP",
            "Bone": "BON",
            "Wood": "WOD",
            "Leather (Hardware Trim)": "LTH",
            "Ceramic": "CER",
            "Glass": "GLS",
            "Resin": "RES",
        }
    },
    "garment_parts": {
        "body": "Body",
        "trim": "Trim",
        "lining": "Lining",
        "part": "Part",
        "facing": "Facing",
        "pocket_bag": "Pocket Bag",
        "interlining": "Interlining",
        "drawcord": "Drawcord"
    }
}

export interface CompositionItem {
    code: string;
    percent: number;
}

export interface CompositionStructure {
    body?: CompositionItem[];
    trim?: CompositionItem[];
    lining?: CompositionItem[];
    part?: CompositionItem[];
    facing?: CompositionItem[];
    pocket_bag?: CompositionItem[];
    interlining?: CompositionItem[];
    drawcord?: CompositionItem[];
}