import { adminService, frontendService } from 'api/api';
import type {
  common_Fitting,
  common_Order,
  common_Product,
  common_ProductionRun,
  common_Sample,
  common_TechCardListItem,
} from 'api/proto-http/admin';
import type { common_ArchiveList } from 'api/proto-http/frontend';
import { formatFittingDate, statusLabel } from 'components/managers/fittings/components/utils';
import { runStatusLabel } from 'components/managers/production-runs/components/options';
import { samplePurposeLabel } from 'components/managers/tech-card/components/sample-options';
import { EntityConfig, EntityOption } from '../components/entity-picker';

// Maps the four typed task links to their real admin/frontend list + single-get
// RPCs. Tech cards and orders search server-side; products and archives have no
// server text search, so they load a recent page and filter in memory.

// ---- tech card (adminService.ListTechCards has a `name` search) -------------
function techCardOption(tc: common_TechCardListItem): EntityOption {
  return {
    value: tc.id ?? 0,
    label: [tc.styleNumber, tc.name].filter(Boolean).join(' · ') || `tech card #${tc.id}`,
    sublabel: `#${tc.id}${tc.brand ? ` · ${tc.brand}` : ''}`,
  };
}

export const techCardConfig: EntityConfig = {
  kind: 'techcard',
  empty: 0,
  mode: 'server',
  searchPlaceholder: 'search tech cards by name / style…',
  emptyResult: 'no tech cards',
  load: async (q) => {
    const r = await adminService.ListTechCards({
      limit: 12,
      offset: undefined,
      orderFactor: undefined,
      stage: undefined,
      gender: undefined,
      brand: undefined,
      season: undefined,
      name: q || undefined,
      productId: undefined,
    });
    return (r.techCards ?? []).map(techCardOption);
  },
  resolve: async (value) => {
    const r: any = await adminService.GetTechCard({ id: value as number });
    const h = r?.techCard?.techCard;
    if (!h) return null;
    return {
      value,
      label: [h.styleNumber, h.name].filter(Boolean).join(' · ') || `tech card #${value}`,
      sublabel: `#${value}`,
    };
  },
};

// ---- product (GetProductsPaged has no name search → client filter) ----------
function productName(p: common_Product): string {
  const body = p.productDisplay?.productBody;
  return body?.translations?.[0]?.name || p.slug || `product #${p.id}`;
}
function productOption(p: common_Product): EntityOption {
  return {
    value: p.id ?? 0,
    label: productName(p),
    sublabel: p.sku || p.slug || `#${p.id}`,
    thumbnail: p.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl,
  };
}

export const productConfig: EntityConfig = {
  kind: 'product',
  empty: 0,
  mode: 'client',
  searchPlaceholder: 'search products by name / sku…',
  emptyResult: 'no products',
  load: async () => {
    const r = await adminService.GetProductsPaged({
      limit: 100,
      offset: undefined,
      sortFactors: undefined,
      orderFactor: 'ORDER_FACTOR_DESC',
      filterConditions: undefined,
      showHidden: true,
    });
    return (r.products ?? []).map(productOption);
  },
  resolve: async (value) => {
    const r: any = await adminService.GetProductByID({ id: value as number });
    const p: common_Product | undefined = r?.product?.product;
    return p ? productOption(p) : null;
  },
};

// ---- order (ListOrders searches by email / id / uuid) ----------------------
function orderOption(o: common_Order): EntityOption {
  const uuid = o.uuid ?? '';
  return {
    value: uuid,
    label: `order ${uuid.slice(0, 8) || o.id}`,
    sublabel: `#${o.id}${o.currency ? ` · ${o.currency}` : ''}`,
  };
}

export const orderConfig: EntityConfig = {
  kind: 'order',
  empty: '',
  mode: 'server',
  searchPlaceholder: 'search orders by id / email / uuid…',
  emptyResult: 'no orders',
  load: async (q) => {
    const t = q.trim();
    const r = await adminService.ListOrders({
      status: undefined,
      paymentMethod: undefined,
      email: t.includes('@') ? t : undefined,
      orderId: /^\d+$/.test(t) ? Number(t) : undefined,
      orderUuid: t && !t.includes('@') && !/^\d+$/.test(t) ? t : undefined,
      limit: 12,
      offset: undefined,
      orderFactor: 'ORDER_FACTOR_DESC',
    });
    return (r.orders ?? []).map(orderOption);
  },
  resolve: async (value) => {
    const r = await adminService.ListOrders({
      status: undefined,
      paymentMethod: undefined,
      email: undefined,
      orderId: undefined,
      orderUuid: value as string,
      limit: 1,
      offset: undefined,
      orderFactor: 'ORDER_FACTOR_DESC',
    });
    const o = (r.orders ?? [])[0];
    return o
      ? orderOption(o)
      : { value, label: `order ${String(value).slice(0, 8)}`, sublabel: '' };
  },
};

// ---- archive / timeline drop (frontendService.GetArchivesPaged, no search) --
function archiveOption(a: common_ArchiveList): EntityOption {
  return {
    value: a.id ?? 0,
    label: a.translations?.[0]?.heading || a.slug || `drop #${a.id}`,
    sublabel: a.tag || `#${a.id}`,
    thumbnail: a.thumbnail?.media?.thumbnail?.mediaUrl,
  };
}

// ---- fitting / примерка (ListFittings has no text search → client filter) ---
// A fitting has no name field, so compose a label from its date + status; the
// client-side filter matches on that text (and the id sublabel).
function fittingOption(f: common_Fitting): EntityOption {
  const date = formatFittingDate(f.fitting?.fittingDate);
  return {
    value: f.id ?? 0,
    label: date ? `примерка · ${date}` : `примерка #${f.id}`,
    sublabel: `#${f.id} · ${statusLabel(f.fitting?.status)}`,
  };
}

export const fittingConfig: EntityConfig = {
  kind: 'fitting',
  empty: 0,
  mode: 'client',
  searchPlaceholder: 'search примерки by date / status…',
  emptyResult: 'no fittings',
  load: async () => {
    const r = await adminService.ListFittings({
      limit: 100,
      offset: undefined,
      orderFactor: 'ORDER_FACTOR_DESC',
      productId: undefined,
      modelId: undefined,
      techCardId: undefined,
    });
    return (r.fittings ?? []).map(fittingOption);
  },
  resolve: async (value) => {
    const r = await adminService.GetFitting({ id: value as number });
    return r?.fitting ? fittingOption(r.fitting) : null;
  },
};

// ---- sample / образец (ListSamples across all styles — B-4) -----------------
// A sample has no name; label from its per-card number + purpose, id sublabel carrying its style.
function sampleOption(s: common_Sample): EntityOption {
  const tc = s.sample?.techCardId;
  return {
    value: s.id ?? 0,
    label: `образец #${s.number ?? '?'} · ${samplePurposeLabel(s.sample?.purpose)}`,
    sublabel: `#${s.id}${tc ? ` · техкарта #${tc}` : ''}`,
  };
}

export const sampleConfig: EntityConfig = {
  kind: 'sample',
  empty: 0,
  mode: 'client',
  searchPlaceholder: 'search образцы by #/purpose…',
  emptyResult: 'no samples',
  load: async () => {
    const r = await adminService.ListSamples({
      limit: 100,
      offset: 0,
      orderFactor: 'ORDER_FACTOR_DESC',
      techCardId: 0,
      status: '',
      purpose: '',
    });
    return (r.samples ?? []).map(sampleOption);
  },
  resolve: async (value) => {
    const r = await adminService.GetSample({ id: value as number });
    return r?.sample ? sampleOption(r.sample) : null;
  },
};

// ---- production run / партия (ListProductionRuns has no text search → client filter) ---
// A run has no name; label from its id + status, sublabel carrying the owning style.
function runOption(r: common_ProductionRun): EntityOption {
  const tc = r.run?.techCardId;
  return {
    value: r.id ?? 0,
    label: `партия #${r.id} · ${runStatusLabel(r.run?.status)}`,
    sublabel: tc ? `техкарта #${tc}` : `#${r.id}`,
  };
}

export const runConfig: EntityConfig = {
  kind: 'run',
  empty: 0,
  mode: 'client',
  searchPlaceholder: 'search партии by #/status…',
  emptyResult: 'no production runs',
  load: async () => {
    const r = await adminService.ListProductionRuns({
      techCardId: undefined,
      status: undefined,
      limit: 100,
      offset: undefined,
    });
    return (r.runs ?? []).map(runOption);
  },
  resolve: async (value) => {
    const r = await adminService.GetProductionRun({ id: value as number });
    return r?.run ? runOption(r.run) : null;
  },
};

export const archiveConfig: EntityConfig = {
  kind: 'archive',
  empty: 0,
  mode: 'client',
  searchPlaceholder: 'search timeline drops…',
  emptyResult: 'no drops',
  load: async () => {
    const r = await frontendService.GetArchivesPaged({
      limit: 100,
      offset: undefined,
      orderFactor: 'ORDER_FACTOR_DESC',
    });
    return (r.archives ?? []).map(archiveOption);
  },
  resolve: async (value) => {
    const r: any = await adminService.GetArchiveByID({ id: value as number });
    const a = r?.archive?.archiveList;
    if (!a) return null;
    return {
      value,
      label: a.translations?.[0]?.heading || a.slug || `drop #${value}`,
      sublabel: a.tag || `#${value}`,
      thumbnail: a.thumbnail?.media?.thumbnail?.mediaUrl,
    };
  },
};
