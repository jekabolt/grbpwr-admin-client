import { currentHost, rootUrl } from 'lib/host';
import { cn } from 'lib/utility';
import { type ChangeEvent, type ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, CheckboxCommon, HeaderNote, Input, Row, Section, Text } from 'ui';

// The approved «sheet» (V3): a narrow side block (wordmark + mode switch, or the team) beside
// one form block of label|value rows and a foot with the one action. Phone: one column.

/** A side plate: its own height on the phone and tablet; the sheet's height at lg (top-aligned). */
export const SIDE = 'self-start lg:self-stretch';

export function AuthSheet({ side, children }: { side: ReactNode; children: ReactNode }) {
  return (
    <main className='lk-auth-page min-h-screen bg-pageBg px-2.5 pt-4 sm:pt-[12vh]'>
      <div className='lk-auth-grid mx-auto grid max-w-[48.75rem] grid-cols-1 gap-stack sm:grid-cols-[12.5rem_minmax(0,1fr)] sm:gap-gutter'>
        {side}
        {children}
      </div>
    </main>
  );
}

export function SheetForm({
  title,
  note,
  noteTone = 'warn',
  onSubmit,
  children,
}: {
  title: string;
  note?: string;
  noteTone?: 'warn' | 'mut' | 'ok';
  onSubmit?: () => void;
  children: ReactNode;
}) {
  return (
    <Section
      title={title}
      headerClassName='[&_*]:normal-case'
      className='min-w-0'
      action={note ? <HeaderNote tone={noteTone}>{note}</HeaderNote> : undefined}
    >
      {onSubmit ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
        </form>
      ) : (
        children
      )}
    </Section>
  );
}

/** `top` — a value taller than one line (chips): the label stays on its first line. */
export function SheetRow({
  label,
  htmlFor,
  top,
  children,
}: {
  label: string;
  htmlFor?: string;
  top?: boolean;
  children: ReactNode;
}) {
  return (
    <Row
      className={cn(
        'grid grid-cols-1 gap-1 py-2 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-3 [&>span:last-child]:min-w-0',
        top ? 'items-start sm:[&>span:first-child]:pt-1' : 'items-center',
      )}
      label={
        <Text
          size='micro'
          variant='label'
          tracking='label'
          component={htmlFor ? 'label' : 'span'}
          htmlFor={htmlFor}
        >
          {label}
        </Text>
      }
      value={children}
    />
  );
}

export function SheetFoot({ left, children }: { left?: ReactNode; children: ReactNode }) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-3 pt-1.5'>
      {left ?? <span />}
      {children}
    </div>
  );
}

export function SheetSubmit({
  children,
  disabled,
  loading,
  onClick,
}: {
  children: string;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      variant='main'
      size='lg'
      type={onClick ? 'button' : 'submit'}
      onClick={onClick}
      disabled={disabled || loading}
      loading={loading}
      className='w-full py-2 sm:w-auto sm:min-w-[9.375rem]'
    >
      {children}
    </Button>
  );
}

export function SheetLink({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <Button variant='underline' className='text-labelColor hover:text-textColor' onClick={onClick}>
      {children}
    </Button>
  );
}

const FIELD = 'h-8 max-sm:h-10';

export function SheetInput({
  invalid,
  className,
  ...props
}: {
  invalid?: boolean;
  className?: string;
  [k: string]: unknown;
}) {
  return (
    <Input
      spellCheck={false}
      aria-invalid={invalid || undefined}
      className={cn(FIELD, className)}
      {...props}
    />
  );
}

export function PasswordInput({
  value,
  onChange,
  invalid,
  autoComplete = 'current-password',
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  autoComplete?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className='relative'>
      <SheetInput
        type={shown ? 'text' : 'password'}
        name='password'
        value={value}
        invalid={invalid}
        autoComplete={autoComplete}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className='pr-12'
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
      <Button
        variant='simpleReverse'
        className='absolute inset-y-px right-px px-2 text-labelColor hover:text-textColor'
        onClick={() => setShown((s) => !s)}
      >
        {shown ? 'hide' : 'show'}
      </Button>
    </div>
  );
}

/** A value shown instead of a field (an email already given), with an optional `change`. */
export function SheetValue({ children, onChange }: { children: ReactNode; onChange?: () => void }) {
  return (
    <div className='flex min-w-0 items-baseline justify-between gap-2'>
      <span className='min-w-0 break-all'>{children}</span>
      {onChange && <SheetLink onClick={onChange}>change</SheetLink>}
    </div>
  );
}

export function Wordmark({ children }: { children: string }) {
  return (
    <Text component='span' size='statBig' className='block leading-none'>
      {children}
    </Text>
  );
}

/** Root auth shares the visual language of the public site. */
export function RootSide({ mode }: { mode: 'signup' | 'login' }) {
  const navigate = useNavigate();
  const signingUp = mode === 'signup';
  return (
    <Section className={cn(SIDE, 'lk-auth-side')}>
      <div>
        <h1>{signingUp ? 'Create a workspace.' : 'Your workspace.'}</h1>
        <p>
          {signingUp
            ? 'Set up a place for your team to develop styles and run production.'
            : 'Sign in to open your apparel workspace.'}
        </p>
      </div>
      <div className='lk-auth-actions'>
        <Button
          variant='simpleReverseWithBorder'
          size='lg'
          onClick={() => navigate(signingUp ? '/login' : '/signup')}
        >
          {signingUp ? 'Log in instead' : 'Create workspace'}
        </Button>
      </div>
    </Section>
  );
}

/**
 * Team (or console) side: its name as the wordmark, `lekalo` under it. `brand` — the team's log-in
 * page: the logo square (`mark`, when the team has one), the name and `lekalo` as one group centred
 * in the plate (in the middle of the stretched plate at lg).
 */
export function TeamSide({
  name,
  sub = 'lekalo',
  mark,
  brand,
}: {
  name: string;
  sub?: string;
  mark?: ReactNode;
  brand?: boolean;
}) {
  const words = (
    <>
      <Wordmark>{name}</Wordmark>
      <Text size='micro' variant='label' tracking='label' component='span' className='block'>
        {sub}
      </Text>
    </>
  );
  if (!brand) return <Section className={SIDE}>{words}</Section>;
  return (
    <Section className={cn(SIDE, 'lg:flex lg:flex-col')}>
      <div className='flex min-w-0 flex-col items-center gap-3 text-center lg:my-auto'>
        {mark}
        {words}
      </div>
    </Section>
  );
}

/** `<slug>.beta.lekalo.studio` after an address field. */
export function baseSuffix(): string {
  return `.${currentHost().base}`;
}

/** The legal pages live on the root host; a team host (join) links across to it. */
function legalHref(doc: 'terms' | 'privacy'): string {
  return currentHost().kind === 'root' ? `/${doc}` : rootUrl(`/${doc}`);
}

/**
 * `agree to` + `terms` `privacy`: the left of the foot line of sign up, new team and join (the
 * phone: full width above the button); the action waits for it. `need` — a provider was pressed
 * without it: the box turns red.
 */
export function AgreeRow({
  checked,
  onChange,
  need,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  need?: boolean;
}) {
  return (
    <div className='flex flex-wrap items-center gap-1'>
      <label htmlFor='agree' className='inline-flex cursor-pointer items-center gap-1.5'>
        <CheckboxCommon
          name='agree'
          checked={checked}
          onChange={onChange}
          aria-invalid={(need && !checked) || undefined}
          className={cn('size-3.5', need && !checked && 'border-error')}
        />
        <Text component='span'>agree to</Text>
      </label>
      {(['terms', 'privacy'] as const).map((doc) => (
        <Button
          key={doc}
          asChild
          variant='underline'
          className='text-labelColor hover:text-textColor'
        >
          <a href={legalHref(doc)} target='_blank' rel='noreferrer'>
            {doc}
          </a>
        </Button>
      ))}
    </div>
  );
}

export function AccountSide({
  title,
  email,
  onLogOut,
}: {
  title: string;
  email: string;
  onLogOut?: () => void;
}) {
  return (
    <Section className={cn(SIDE, 'lk-auth-side')}>
      <div>
        <h1>{title}</h1>
        {email && <p className='break-all'>{email}</p>}
      </div>
      {onLogOut && (
        <div className='lk-auth-actions'>
          <Button variant='simpleReverseWithBorder' size='lg' onClick={onLogOut}>
            Log out
          </Button>
        </div>
      )}
    </Section>
  );
}

/** A server without the root token: the team waits for an operator — its address, nothing to open. */
export function AwaitingApproval({ slug, email }: { slug: string; email: string }) {
  return (
    <AuthSheet side={<AccountSide title='Awaiting approval' email={email} />}>
      <SheetForm title='Workspace address'>
        <SheetRow label='address'>
          <Text component='span' className='break-all'>
            {slug}
            {baseSuffix()}
          </Text>
        </SheetRow>
      </SheetForm>
    </AuthSheet>
  );
}
