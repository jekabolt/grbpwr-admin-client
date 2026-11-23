import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { Shop } from 'api/proto-http/admin';
import { notify } from 'lib/stores/store';
import { refusalWord } from './model';

// The «shop» screen's one read and its writes (lane X18-L4). Every write answers the whole shop,
// which replaces the cached one: the screen never re-derives what the server decided.

export const shopKeys = { mine: () => ['team', 'shop'] as const };

export function useShop() {
  return useQuery({
    queryKey: shopKeys.mine(),
    queryFn: () => adminService.GetShop({}),
    select: (r) => r.shop,
    retry: false,
  });
}

/** A write that answers `{ shop }`; a refusal is a toast unless `quiet` (the caller shows it). */
export function useShopWrite<V, R extends { shop?: Shop | undefined }>(
  fn: (v: V) => Promise<R>,
  opts: { quiet?: boolean } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (r.shop) qc.setQueryData(shopKeys.mine(), { shop: r.shop });
    },
    onError: (e) => {
      if (opts.quiet) return;
      notify({ sev: 'error', subject: 'SHOP', text: refusalWord(e) });
    },
  });
}

export const shopApi = {
  setEnabled: (enabled: boolean) => adminService.SetShopEnabled({ enabled }),
  attach: (host: string) => adminService.AttachShopDomain({ host }),
  check: (host: string) => adminService.CheckShopDomain({ host }),
  remove: (host: string) => adminService.RemoveShopDomain({ host }),
  primary: (host: string) => adminService.SetShopPrimaryHost({ host }),
  mail: (v: { fromName: string; replyTo: string }) => adminService.SetShopMail(v),
  connect: () => adminService.StartStripeConnect({ returnPath: '/shop' }),
  keys: (v: { publishableKey: string; secretKey: string; webhookSecret: string }) =>
    adminService.SetStripeKeys(v),
  disconnect: () => adminService.DisconnectStripe({}),
};
