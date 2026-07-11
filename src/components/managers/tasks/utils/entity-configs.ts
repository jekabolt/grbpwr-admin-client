import { adminService, frontendService } from 'api/api';
import type { common_Order, common_Product, common_TechCardListItem } from 'api/proto-http/admin';
import type { common_ArchiveList } from 'api/proto-http/frontend';
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
