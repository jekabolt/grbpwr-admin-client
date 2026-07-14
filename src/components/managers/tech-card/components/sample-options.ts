// Sample enumerations are plain lowercase strings on the contract (not proto enums).

export const samplePurposeOptions = [
  { value: 'proto', label: 'proto' },
  { value: 'fit', label: 'fit' },
  { value: 'sms', label: 'salesman (SMS)' },
  { value: 'pp', label: 'pre-production (PP)' },
];

export const sampleStatusOptions = [
  { value: 'planned', label: 'planned' },
  { value: 'in_sewing', label: 'in sewing' },
  { value: 'done', label: 'done' },
  { value: 'scrapped', label: 'scrapped' },
];

export const sampleFabricSourceOptions = [
  { value: 'sample', label: 'sample fabric' },
  { value: 'production', label: 'production fabric' },
];

const label = (opts: { value: string; label: string }[], v?: string) =>
  opts.find((o) => o.value === v)?.label ?? v ?? '—';

export const samplePurposeLabel = (v?: string) => label(samplePurposeOptions, v);
export const sampleStatusLabel = (v?: string) => label(sampleStatusOptions, v);
export const sampleFabricSourceLabel = (v?: string) => label(sampleFabricSourceOptions, v);
