import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { Shop } from 'api/proto-http/admin';
import { notify } from 'lib/stores/store';
import { useEffect } from 'react';
import { refusalWord, stripeFinishToken, withoutStripeReturn } from './model';

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
  finish: (token: string) => adminService.FinishStripeConnect({ token }),
  keys: (v: { publishableKey: string; secretKey: string; webhookSecret: string }) =>
    adminService.SetStripeKeys(v),
  disconnect: () => adminService.DisconnectStripe({}),
};

// Tokens already sent: the token is single use, and a remount must not send it twice.
const finished = new Set<string>();

/**
 * Back from Stripe Connect (`?stripe=finish#token=…`, lane X18-L3): the token goes to
 * FinishStripeConnect once, and the token and `?stripe` leave the address at once, whatever the
 * answer. `?stripe=cancelled|error` only leaves the address.
 */
export function useStripeReturn() {
  const qc = useQueryClient();
  const finish = useShopWrite(shopApi.finish);
  const { mutate } = finish;

  useEffect(() => {
    const { pathname, search, hash } = window.location;
    if (!new URLSearchParams(search).has('stripe')) return;
    const token = stripeFinishToken(search, hash);
    window.history.replaceState(window.history.state, '', withoutStripeReturn(pathname, search));
    if (!token || finished.has(token)) return;
    finished.add(token);
    mutate(token, {
      onSettled: () => qc.invalidateQueries({ queryKey: shopKeys.mine() }),
    });
  }, [mutate, qc]);
}
