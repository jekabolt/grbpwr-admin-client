import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Button } from 'ui';

import mark from './lekalo-mark.svg';
import lockup from './lekalo-lockup-white.svg';
import './site.css';

export const CONTACT = 'hello@lekalo.studio';

const domains = [
  {
    title: 'Product',
    links: [
      ['Overview', '/'],
      ['Pricing', '/pricing'],
      ['Newsletter', '/#newsletter'],
    ],
  },
  {
    title: 'Workspace',
    links: [
      ['Log in', '/login'],
      ['Create workspace', '/signup'],
    ],
  },
  {
    title: 'Legal',
    links: [
      ['Terms', '/terms'],
      ['Privacy', '/privacy'],
    ],
  },
] as const;

function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const { pathname } = useLocation();
  const home = signedIn ? '/overview' : '/';
  const [active, setActive] = useState<number | null>(null);
  const header = useRef<HTMLElement>(null);
  const sheet = useRef<HTMLElement>(null);

  useEffect(() => {
    setActive(null);
  }, [pathname]);

  useEffect(() => {
    if (active === null) return;
    const outside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setActive(null);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [active]);

  return (
    <header
      ref={header}
      className='lk-header'
      onKeyDown={(event) => {
        if (active === null || event.key !== 'Escape') return;
        header.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.focus();
        setActive(null);
      }}
    >
      <div className='lk-header-rail'>
        <Link
          to={home}
          className='lk-mark'
          aria-label='Lekalo Studio home'
          onClick={() => setActive(null)}
        >
          <img src={mark} alt='' width={128} height={128} />
          <span>
            <b>
              lekalo<span className='lk-mark-dot'>.</span>
            </b>
            studio
          </span>
        </Link>
        <div className='lk-account'>
          <Link to={signedIn ? '/' : '/login'}>{signedIn ? 'Your workspaces' : 'Log in'}</Link>
          <Button asChild variant='main' size='lg' className='lk-header-create'>
            <Link to={signedIn ? '/new' : '/signup'}>Create workspace</Link>
          </Button>
        </div>
      </div>
      <nav aria-label='Main navigation'>
        <div className='lk-nav-tabs'>
          {domains.map(({ title }, index) => (
            <Button
              key={title}
              type='button'
              aria-expanded={active === index}
              aria-controls='lk-nav-sheet'
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                const open = active !== index;
                setActive(open ? index : null);
                if (open && event.detail === 0) {
                  requestAnimationFrame(() => sheet.current?.querySelector('a')?.focus());
                }
              }}
              onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                if (event.key !== 'ArrowDown') return;
                event.preventDefault();
                setActive(index);
                requestAnimationFrame(() => sheet.current?.querySelector('a')?.focus());
              }}
            >
              <span>{title}</span>
            </Button>
          ))}
        </div>
        <section ref={sheet} id='lk-nav-sheet' className='lk-nav-sheet' hidden={active === null}>
          {active !== null && (
            <ul aria-label={domains[active].title}>
              {domains[active].links.map(([label, href]) => {
                const destination =
                  href === '/' || href === '/#newsletter'
                    ? home + (href.includes('#') ? '#newsletter' : '')
                    : signedIn && href === '/signup'
                      ? '/new'
                      : signedIn && href === '/login'
                        ? '/'
                        : href;
                return (
                  <li key={href}>
                    <NavLink end to={destination} onClick={() => setActive(null)}>
                      <span aria-hidden='true'>&gt;</span>
                      {signedIn && href === '/login' ? 'Your workspaces' : label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </nav>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className='lk-footer'>
      <div className='lk-footer-grid'>
        <nav className='lk-footer-group lk-footer-about' aria-label='About'>
          <strong className='lk-label'>About</strong>
          <ul>
            <li>
              <NavLink to='/pricing'>Pricing</NavLink>
            </li>
            <li>
              <NavLink to='/help'>Help Center</NavLink>
            </li>
            <li>
              <NavLink to='/our-story'>Our Story</NavLink>
            </li>
          </ul>
        </nav>
        <nav className='lk-footer-group' aria-label='Legal'>
          <strong className='lk-label'>Legal</strong>
          <ul>
            <li>
              <NavLink to='/terms'>Terms</NavLink>
            </li>
            <li>
              <NavLink to='/privacy'>Privacy</NavLink>
            </li>
          </ul>
        </nav>
        <div className='lk-footer-group'>
          <strong className='lk-label'>Connect</strong>
          <ul>
            <li>
              <span className='lk-footer-label'>Instagram</span>
            </li>
            <li>
              <span className='lk-footer-label'>TikTok</span>
            </li>
            <li>
              <span className='lk-footer-label'>LinkedIn</span>
            </li>
          </ul>
        </div>
        <div className='lk-footer-group'>
          <strong className='lk-label'>Contact</strong>
          <ul>
            <li>
              <a href={`mailto:${CONTACT}`}>
                hello@
                <wbr />
                lekalo.studio
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className='lk-footer-brand'>
        <a className='lk-footer-mark' href='#lk-top' aria-label='Lekalo Studio, back to top'>
          <img src={lockup} width={502} height={112} alt='' />
        </a>
      </div>
    </footer>
  );
}

export function PublicSite({ children, signedIn }: { children: ReactNode; signedIn: boolean }) {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    const title = document.querySelector('.lk-site main h1')?.textContent?.trim();
    document.title = title ? `${title} | Lekalo Studio` : 'Lekalo Studio';
    if (hash && !hash.includes('=')) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  return (
    <div id='lk-top' className='lk-site'>
      <SiteHeader signedIn={signedIn} />
      {children}
      <SiteFooter />
    </div>
  );
}
