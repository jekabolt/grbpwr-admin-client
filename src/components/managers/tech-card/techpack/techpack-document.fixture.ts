import type { common_TechCard } from 'api/proto-http/admin';

const decimal = (value: string) => ({ value });

const media = (id: number, url: string) => ({
  id,
  media: {
    fullSize: { mediaUrl: url, width: 800, height: 1000 },
  },
});

export const techpackMeasurements = [
  { id: 101, name: 'Chest width' },
  { id: 102, name: 'Body length' },
];

export const techpackSizeChart = {
  cells: [
    { sizeId: 1, measurementNameId: 101, value: decimal('54') },
    { sizeId: 1, measurementNameId: 102, value: decimal('72') },
  ],
};

export const techpackMarkerLayouts = [];

export const techpackGeometry = {
  pieces: new Map(),
  grainDeg: new Map(),
  shapes: { shapeByKey: new Map(), grainLayer: 'GRAIN' },
};

export const techpackFixture = {
  id: 42,
  lockVersion: 7,
  techCard: {
    name: 'Workshop jacket',
    brand: 'GRBPWR',
    status: 'released',
    collection: 'Core',
    styleNumber: 'WJ-042',
    targetGender: 'TECH_CARD_TARGET_GENDER_UNISEX',
    baseSampleSizeId: 1,
    measurementUnit: 'TECH_CARD_MEASUREMENT_UNIT_CM',
    sizeIds: [1, 2],
    pieces: [
      {
        lineKey: 'FRT_L_MAIN',
        name: 'Left front',
        piecesPerGarment: 1,
        grainline: 'TECH_CARD_GRAINLINE_PARALLEL',
      },
      {
        lineKey: 'FRT_R_MAIN',
        name: 'Right front',
        piecesPerGarment: 1,
        grainline: 'TECH_CARD_GRAINLINE_PARALLEL',
      },
      {
        lineKey: 'BACK_MAIN',
        name: 'Back panel',
        piecesPerGarment: 1,
        grainline: 'TECH_CARD_GRAINLINE_PARALLEL',
        fused: true,
      },
    ],
    bomItems: [
      {
        id: 1,
        lineKey: 'FAB_MAIN',
        section: 'TECH_CARD_BOM_SECTION_FABRIC',
        purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
        name: 'Cotton twill',
        color: 'Black',
        composition: '100% cotton',
        fabricWidth: decimal('150'),
        effectiveFabricWidthCm: decimal('148'),
        fabricWeightGsm: decimal('320'),
        unitPrice: decimal('12.5'),
        currency: 'EUR',
        unit: 'm',
      },
      {
        id: 2,
        lineKey: 'THREAD_MAIN',
        section: 'TECH_CARD_BOM_SECTION_THREAD',
        name: 'Core thread 40',
        color: 'Black',
        composition: 'polyester',
        supplier: 'Thread House',
      },
      {
        id: 3,
        lineKey: 'BUTTON_MAIN',
        section: 'TECH_CARD_BOM_SECTION_HARDWARE',
        kind: 'TECH_CARD_BOM_KIND_BUTTON',
        name: 'Button 18 mm',
        composition: 'horn',
        qtyPerGarment: decimal('4'),
      },
    ],
    operations: [
      {
        operationNumber: 10,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_LOCKSTITCH',
        work: 'join_lockstitch',
        inputKeys: ['FRT_L_MAIN', 'FRT_R_MAIN'],
        outputUnitKey: 'FRONT_UNIT',
        outputUnitName: 'Front unit',
        bomLineKeys: ['THREAD_MAIN'],
        note: 'Match notches',
      },
      {
        operationNumber: 20,
        operationType: 'TECH_CARD_OPERATION_TYPE_FUSING',
        work: 'fuse',
        inputKeys: ['BACK_MAIN'],
        pressTemperatureC: 160,
        pressDwellSec: 12,
      },
      {
        operationNumber: 30,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH',
        work: 'button_attach',
        inputKeys: ['FRONT_UNIT'],
        bomLineKeys: ['BUTTON_MAIN'],
        bomQuantities: [{ lineKey: 'BUTTON_MAIN', qtyPerGarment: decimal('4') }],
        calloutNumber: 1,
        zone: 'TECH_CARD_GARMENT_ZONE_FRONT',
      },
    ],
    patterns: [
      {
        id: 11,
        filename: 'main.dxf',
        url: 'https://assets.example/main.dxf',
        version: 3,
        fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
      },
    ],
    pieceDxfAliases: {
      items: [
        {
          pieceLineKey: 'FRT_L_MAIN',
          fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
        },
        {
          pieceLineKey: 'FRT_R_MAIN',
          fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
        },
        {
          pieceLineKey: 'BACK_MAIN',
          fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
        },
      ],
    },
    callouts: [
      {
        number: 1,
        part: 'Front placket',
        posX: decimal('0.45'),
        posY: decimal('0.35'),
        mediaId: 101,
      },
      {
        number: 2,
        kind: 'TECH_CARD_ANNOTATION_KIND_DIM',
        description: 'Chest width',
        mediaId: 101,
        points: [
          { x: decimal('0.2'), y: decimal('0.3') },
          { x: decimal('0.8'), y: decimal('0.3') },
        ],
      },
      {
        number: 3,
        kind: 'TECH_CARD_ANNOTATION_KIND_DIM',
        description: 'Body length',
        mediaId: 101,
        points: [
          { x: decimal('0.5'), y: decimal('0.1') },
          { x: decimal('0.5'), y: decimal('0.9') },
        ],
      },
    ],
    garmentLabels: [
      {
        key: 'main-label',
        placement: 'CB neck',
        attachment: 'edge stitch',
        folding: 'end fold',
        size: '30 × 60 mm',
        qtyPerGarment: 1,
      },
    ],
    careLabel: {},
    issues: [
      {
        status: 'TECH_CARD_ISSUE_STATUS_OPEN',
        severity: 'TECH_CARD_ISSUE_SEVERITY_MEDIUM',
        description: 'Confirm pocket depth',
        operationNumber: 10,
      },
    ],
    signoffs: [
      {
        section: 'TECH_CARD_SIGNOFF_SECTION_TECHNICAL',
        state: 'TECH_CARD_SIGNOFF_STATE_APPROVED',
        signedBy: 'A. Maker',
        signedAt: '2026-03-14T10:00:00Z',
        note: 'Sample approved',
        signedDigest: 'old-digest',
      },
    ],
  },
  colorways: [
    {
      colorwayId: 5,
      devName: 'Night',
      devHex: '#111111',
      colours: [{ label: 'Black', hex: '#111111' }],
      usages: [
        {
          bomLineKey: 'FAB_MAIN',
          pieceLineKey: 'FRT_L_MAIN',
          color: 'Black',
        },
        {
          bomLineKey: 'FAB_MAIN',
          pieceLineKey: 'FRT_R_MAIN',
          color: 'Black',
        },
        {
          bomLineKey: 'FAB_MAIN',
          pieceLineKey: 'BACK_MAIN',
          color: 'Black',
        },
        { bomLineKey: 'THREAD_MAIN', color: 'Black' },
        { bomLineKey: 'BUTTON_MAIN', color: 'Black' },
      ],
    },
  ],
  markers: [
    {
      id: 7,
      name: 'Main marker',
      bomLineKey: 'FAB_MAIN',
      bomItemName: 'Cotton twill',
      fabricWidthCm: decimal('148'),
      usedLengthCm: decimal('185'),
      efficiencyPct: decimal('82.4'),
      consumptionPerUnitCm: decimal('185'),
      totalCount: 3,
    },
  ],
  seams: [],
  resolvedTechnicalMedia: [
    { kind: 'TECH_CARD_MEDIA_KIND_FRONT', media: media(101, 'https://assets.example/front.png') },
    { kind: 'TECH_CARD_MEDIA_KIND_BACK', media: media(102, 'https://assets.example/back.png') },
  ],
  sectionDigests: [{ section: 'TECH_CARD_SIGNOFF_SECTION_TECHNICAL', digest: 'live-digest' }],
  revisions: [
    {
      createdAt: '2026-03-15T12:00:00Z',
      action: 'updated',
      section: 'construction',
      author: 'T. Owner',
      changeNote: 'Button placement',
    },
  ],
} as unknown as common_TechCard;

const coverageCard = techpackFixture.techCard!;

/** Extra enum and generator shapes for the pseudo-locale coverage test only. */
export const techpackCoverageFixture = {
  ...techpackFixture,
  techCard: {
    ...coverageCard,
    status: 'DRAFT',
    targetGender: 'GENDER_ENUM_FEMALE',
    bomItems: [
      ...(coverageCard.bomItems ?? []),
      {
        id: 4,
        lineKey: 'INTERFACING_MAIN',
        section: 'TECH_CARD_BOM_SECTION_INTERLINING',
        purpose: 'TECH_CARD_BOM_PURPOSE_INTERFACING',
        name: 'Fusible canvas',
        color: 'Natural',
        composition: '100% cotton',
        fabricWidth: decimal('90'),
      },
    ],
    operations: [
      ...(coverageCard.operations ?? []).map((operation) =>
        operation.operationNumber === 10
          ? {
              ...operation,
              topstitch: {
                mode: 'TECH_CARD_TOPSTITCH_MODE_EDGE' as const,
                widthMm: decimal('6'),
                rows: 2,
              },
            }
          : operation.operationNumber === 20
            ? {
                ...operation,
                pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_FUSING_PRESS' as const,
              }
            : operation,
      ),
      {
        operationNumber: 40,
        operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
        machineType: 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE',
        work: 'buttonhole',
        inputKeys: ['FRONT_UNIT'],
        hardware: {
          holePrep: 'TECH_CARD_HOLE_PREP_NONE',
          reinforcement: 'TECH_CARD_REINFORCEMENT_NONE',
        },
        fastening: {
          buttonholeOrientation: 'TECH_CARD_BUTTONHOLE_ORIENTATION_VERTICAL',
          cutLengthMm: decimal('12'),
        },
      },
      {
        operationNumber: 50,
        operationType: 'TECH_CARD_OPERATION_TYPE_PRESS',
        work: 'press_flat',
        inputKeys: ['FRONT_UNIT'],
        pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
      },
    ],
  },
  revisions: [
    {
      createdAt: '2026-03-16T12:00:00Z',
      action: 'created',
      section: 'header',
      author: 'T. Owner',
      changeNote: 'Initial card',
    },
    ...(techpackFixture.revisions ?? []),
  ],
} as common_TechCard;
