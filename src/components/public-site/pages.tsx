import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, PLACEHOLDER_SURFACE, Section } from 'ui';

import receiveRun from './receive-run.webp';
import runPlan from './run-plan.webp';
import { CONTACT } from './site-shell';
import techCard from './tech-card.webp';

const workflow = [
  {
    label: 'Tech card',
    image: techCard,
    alt: 'Tech card for a dust bag with its makes and release checklist',
  },
  {
    label: 'Production run',
    image: runPlan,
    alt: 'Production run with planned quantities and material costs',
  },
  {
    label: 'Batch receipt',
    image: receiveRun,
    alt: 'Production run after the finished batch has been received',
  },
];

export function Landing() {
  const [email, setEmail] = useState('');

  function requestNewsletter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = encodeURIComponent(
      `Please send Lekalo Studio newsletter updates to ${email.trim()}.`,
    );
    window.location.href = `mailto:${CONTACT}?subject=Lekalo%20newsletter&body=${body}`;
  }

  return (
    <main>
      <section className='lk-hero' aria-labelledby='lk-title'>
        <div>
          <p className='lk-kicker'>Apparel development &amp; production</p>
          <h1 id='lk-title'>
            <span>From tech card</span> <span>to production.</span>
          </h1>
        </div>
        <div className='lk-hero-intro'>
          <p>
            Develop styles, approve samples, and run production with patterns, materials, and costs
            in one workspace.
          </p>
        </div>
        <div className='lk-hero-workflow'>
          <ol aria-label='From tech card to batch receipt'>
            {workflow.map(({ label, image, alt }) => (
              <li key={label}>
                <figure>
                  <figcaption>{label}</figcaption>
                  <img src={image} width={800} height={450} alt={alt} />
                </figure>
              </li>
            ))}
          </ol>
          <Link to='/help#production-run'>See how a run works</Link>
        </div>
      </section>
      <div className='lk-spacer' style={PLACEHOLDER_SURFACE} aria-hidden='true' />
      <section className='lk-newsletter' id='newsletter' aria-labelledby='lk-newsletter-title'>
        <div className='lk-newsletter-copy'>
          <h2 id='lk-newsletter-title'>The Lekalo newsletter</h2>
          <p>Product updates and workflow tips for apparel teams.</p>
        </div>
        <form onSubmit={requestNewsletter}>
          <label htmlFor='newsletter-email'>Email address</label>
          <div className='lk-newsletter-row'>
            <Input
              name='newsletter-email'
              type='email'
              autoComplete='email'
              placeholder='you@site.io'
              value={email}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
              required
            />
            <Button variant='main' size='lg' type='submit'>
              Request updates
            </Button>
          </div>
          <p className='lk-newsletter-status'>Opens an email to Lekalo.</p>
        </form>
      </section>
    </main>
  );
}

function PublicArticle({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className='lk-article'>
      <h1>{title}</h1>
      <div className='lk-article-content'>{children}</div>
    </main>
  );
}

export function HelpCenter({ signedIn }: { signedIn: boolean }) {
  return (
    <PublicArticle title='Help Center'>
      <div className='lk-help-grid'>
        <Section title='Account and workspaces'>
          <p>
            <Link to={signedIn ? '/new' : '/signup'}>Create a workspace</Link> and confirm your
            email to get started. If you already have an account, <Link to='/login'>log in</Link>{' '}
            and choose a workspace.
          </p>
          <p>
            <Link to='/reset'>Reset your password</Link> if you cannot sign in.
          </p>
        </Section>
        <Section title='Set up a tech card'>
          <p>
            Create a tech card for each style. Add its flats, measurements, bill of materials, and
            pattern files. Keep fitting notes and sample changes on the card as you develop the
            style.
          </p>
          <p>Use the sign-off and release checklist to see what still needs review.</p>
        </Section>
      </div>
      <Section title='From tech card to production run' id='production-run'>
        <ol>
          <li>Review the style’s materials, patterns, sizing, and assembly instructions.</li>
          <li>
            Open Production Runs and create a run from the tech card. Set the planned quantities.
          </li>
          <li>
            Review the material plan. Issue materials and prepare cutting where the run requires it.
          </li>
          <li>Receive the finished batch into stock and record its actual costs.</li>
        </ol>
      </Section>
      <Section title='Contact support'>
        <p>
          Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Include your workspace address and
          the step you were on.
        </p>
      </Section>
    </PublicArticle>
  );
}

export function OurStory({ signedIn }: { signedIn: boolean }) {
  return (
    <PublicArticle title='Our Story'>
      <Section title='Built around a garment'>
        <p>
          Making one style means coordinating drawings, patterns, materials, fittings, and a
          production plan. We built Lekalo to keep that work connected as it passes between the
          designers, pattern makers, and production teams who do it.
        </p>
        <p>
          The tech card is where a style takes shape. It follows the garment from early development
          through samples and approvals, and gives the production team a specification to work from
          when they plan a run.
        </p>
      </Section>
      <Section title='From development to the floor'>
        <p>
          Patterns and materials feed into cutting and costing. A production run carries that work
          forward into quantities, material issues, and batch receipts.
        </p>
        <div className='lk-article-actions'>
          <Button asChild variant='main' size='lg'>
            <Link to={signedIn ? '/new' : '/signup'}>Create workspace</Link>
          </Button>
          <Link to='/help#production-run'>See how a run works</Link>
        </div>
      </Section>
    </PublicArticle>
  );
}
