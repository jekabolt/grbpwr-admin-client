import { useState } from 'react';
import { Button, Select } from 'ui';

import { CONTACT } from './site-shell';

const plans = [
  {
    name: 'Solo',
    purpose: 'Write tech packs',
    rate: 40,
    min: 500,
    max: 4000,
    features: ['Tech cards and flats', 'Bill of materials', 'Tech pack PDF'],
  },
  {
    name: 'Brand',
    purpose: 'Develop and fit styles',
    rate: 60,
    min: 500,
    max: 4000,
    features: ['Everything in Solo', 'Patterns and colorways', 'Samples and fitting rounds'],
  },
  {
    name: 'Studio',
    purpose: 'Run production',
    rate: 220,
    min: 1000,
    max: 8000,
    features: ['Everything in Brand', 'Cutting and material stock', 'Costing and production runs'],
  },
] as const;

const periods = {
  monthly: { label: 'Monthly', months: 1, discount: 0 },
  quarterly: { label: 'Quarterly', months: 3, discount: 0.25 },
  yearly: { label: 'Yearly', months: 12, discount: 0.4 },
};
const currencies = {
  GBP: { rate: 1, step: 1, prefix: '£' },
  USD: { rate: 1.3, step: 5, prefix: '$' },
  EUR: { rate: 1.2, step: 1, prefix: '€' },
  AED: { rate: 4.8, step: 5, prefix: 'AED ' },
};
const creditOptions = [500, 1000, 2000, 4000, 8000];
const whole = new Intl.NumberFormat('en');
const periodOptions = Object.entries(periods).map(([value, { label, discount }]) => ({
  value,
  label: discount > 0 ? `${label} · Save ${discount * 100}%` : label,
}));
const currencyOptions = Object.keys(currencies).map((value) => ({ value, label: value }));
const monthlyCreditOptions = creditOptions.map((count) => ({
  value: String(count),
  label: whole.format(count),
}));

export function Pricing() {
  const [periodKey, setPeriod] = useState<keyof typeof periods>('monthly');
  const [currencyKey, setCurrency] = useState<keyof typeof currencies>('GBP');
  const [credits, setCredits] = useState(500);
  const period = periods[periodKey];
  const currency = currencies[currencyKey];
  const money = (amount: number) => currency.prefix + whole.format(amount);

  return (
    <main className='lk-pricing'>
      <div className='lk-price-heading'>
        <h1>Pricing</h1>
        <p>Illustrative rates</p>
      </div>
      <div className='lk-price-controls'>
        <div>
          <span>Billing</span>
          <Select
            name='billing'
            placeholder='Billing'
            className='lk-price-select'
            value={periodKey}
            items={periodOptions}
            fullWidth
            onValueChange={(value) => setPeriod(value as keyof typeof periods)}
          />
        </div>
        <div>
          <span>Currency</span>
          <Select
            name='currency'
            placeholder='Currency'
            className='lk-price-select'
            value={currencyKey}
            items={currencyOptions}
            fullWidth
            onValueChange={(value) => setCurrency(value as keyof typeof currencies)}
          />
        </div>
        <div>
          <span>Monthly credits</span>
          <Select
            name='credits'
            placeholder='Monthly credits'
            className='lk-price-select'
            value={String(credits)}
            items={monthlyCreditOptions}
            fullWidth
            onValueChange={(value) => setCredits(Number(value))}
          />
        </div>
      </div>
      <div className='lk-price-grid'>
        {plans.map((plan) => {
          const allowance = Math.max(plan.min, Math.min(plan.max, credits));
          const month =
            Math.ceil(
              (((plan.rate * allowance) / plan.min) * (1 - period.discount) * currency.rate) /
                currency.step -
                1e-9,
            ) * currency.step;
          const featured = plan.name === 'Brand';
          return (
            <article
              className={featured ? 'lk-price-plan lk-price-featured' : 'lk-price-plan'}
              key={plan.name}
            >
              <div>
                <h2>{plan.name}</h2>
                <p>{plan.purpose}</p>
              </div>
              <div className='lk-price-amount' aria-live='polite'>
                <strong>{money(month)}</strong> <span>/ month</span>
                {period.months > 1 && (
                  <p>
                    {money(month * period.months)} billed {period.label.toLowerCase()}
                  </p>
                )}
              </div>
              <p className='lk-price-allowance'>
                {whole.format(allowance)} credits / month
                {allowance !== credits && (
                  <span> · {allowance < credits ? 'plan maximum' : 'plan minimum'}</span>
                )}
              </p>
              <ul aria-label={`${plan.name} features`}>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <Button asChild variant={featured ? 'main' : 'secondary'} size='lg'>
                <a
                  href={`mailto:${CONTACT}?subject=${encodeURIComponent(`Lekalo ${plan.name} plan`)}`}
                >
                  Ask about {plan.name}
                </a>
              </Button>
            </article>
          );
        })}
      </div>
      <p className='lk-price-caption'>
        Pricing and credit allowances are illustrative. Contact us for availability.
      </p>
    </main>
  );
}
