// НАСТРОЙКА QR — зона «настройки» экрана составников (план §7, §9.3).
//
// Пресеты: витрина (дефолт) / свой шаблон / фиксированная ссылка. Под полем — ЖИВОЙ пример ссылки
// для выбранного в превью варианта, версия QR, мм на модуль и мини-QR: всё из того же `qr.ts`, что
// рисует изнанку A, поэтому то, что видно здесь, и есть то, что напечатается.
import Input from 'ui/components/input';
import { Chip, ChipRow } from 'ui/components/chip';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import {
  QR_SIZE_MM,
  QR_QUIET_MODULES,
  qrPrims,
  STOREFRONT_QR_TEMPLATE,
  type QrTemplateVars,
} from './qr';
import { qrLink, type CareLabelPrefs, type QrPreset } from './use-care-label-prefs';

const PRESETS: { id: QrPreset; label: string; title: string }[] = [
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

/** Мини-QR: те же прямоугольники, что на изнанке A, с тихой зоной вокруг. */
function MiniQr({ link }: { link: string }) {
  const r = qrPrims(link, 0, 0, QR_SIZE_MM);
  if (r.prims.length === 0) return null;
  const q = QR_QUIET_MODULES * r.moduleMm;
  const side = QR_SIZE_MM + 2 * q;
  return (
    <svg
      viewBox={`${-q} ${-q} ${side} ${side}`}
      width={96}
      height={96}
      role='img'
      aria-label='QR preview'
      data-care-mini-qr={r.version}
      style={{ background: '#fff', flex: 'none' }}
    >
      {r.prims.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill='#000' />
      ))}
    </svg>
  );
}

export function QrSettings({
  prefs,
  onChange,
  example,
}: {
  prefs: CareLabelPrefs;
  onChange: (patch: Partial<CareLabelPrefs>) => void;
  /** Выбранный в превью вариант: подстановки и подпись («RC27-99999-OFW-03 · M»). */
  example: { vars: QrTemplateVars; label: string } | null;
}) {
  const link = example ? qrLink(prefs, example.vars) : '';
  const r = example ? qrPrims(link, 0, 0, QR_SIZE_MM) : null;
  const holes = r?.holes ?? [];
  const editable = prefs.qrPreset !== 'storefront';

  return (
    <div className='flex flex-col gap-2' data-care-zone='qr'>
      <ChipRow>
        {PRESETS.map((p) => (
          <Chip
            key={p.id}
            nonForm
            pressed={prefs.qrPreset === p.id}
            selected={prefs.qrPreset === p.id}
            onClick={() => onChange({ qrPreset: p.id })}
            title={p.title}
            data-qr-preset={p.id}
          >
            {p.label}
          </Chip>
        ))}
      </ChipRow>
      <Input
        name='care-qr-template'
        aria-label='QR link template'
        data-care-qr-template=''
        value={editable ? prefs.qrTemplate : STOREFRONT_QR_TEMPLATE}
        disabled={!editable}
        placeholder={
          prefs.qrPreset === 'fixed' ? 'https://…' : 'https://grbpwr.com/p/{base_sku}?s={size}'
        }
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange({ qrTemplate: e.target.value })
        }
      />
      {prefs.qrPreset === 'custom' && (
        <Text size='micro' variant='label'>
          {'{base_sku} {sku} {size} {colorway_id} {style}'} — base SKU is lower-cased
        </Text>
      )}
      <div className='flex items-start gap-3'>
        {link && holes.every((h) => h.level !== 'block') ? <MiniQr link={link} /> : null}
        <div className='flex min-w-0 flex-col gap-1'>
          <Text size='micro' variant='label'>
            {example ? `example · ${example.label}` : 'example · pick a colourway'}
          </Text>
          <Text size='micro' className='break-all' data-care-qr-link=''>
            {link || '—'}
          </Text>
          {r && r.version > 0 && (
            <Text size='micro' variant='label' data-care-qr-readout=''>
              version {r.version} · {r.size} modules · {r.moduleMm.toFixed(3)} mm / module at{' '}
              {QR_SIZE_MM} mm
            </Text>
          )}
          {holes.map((h) => (
            <div key={h.code} className='flex items-center gap-1.5' data-hole={h.code}>
              <Pill tone={h.level === 'block' ? 'warn' : 'attention'}>{h.level}</Pill>
              <Text size='micro'>{h.message}</Text>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
