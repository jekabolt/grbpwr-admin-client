// The QR presets the label's QR editor offers.
import { STOREFRONT_QR_TEMPLATE } from './qr';
import type { QrPreset } from './use-care-label-prefs';

export const QR_PRESETS: { id: QrPreset; label: string; title: string }[] = [
  {
    id: 'storefront',
    label: 'storefront',
    title: `the colourway page on the storefront: ${STOREFRONT_QR_TEMPLATE} — redirects to the scanner's language`,
  },
  {
    id: 'custom',
    label: 'custom template',
    title: 'your own link with {base_sku} {sku} {size} {colorway_id} {style}',
  },
  { id: 'fixed', label: 'fixed URL', title: 'one link on every label, nothing substituted' },
];
