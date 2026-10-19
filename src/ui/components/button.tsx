import { Slot } from '@radix-ui/react-slot';
import { cva, VariantProps } from 'class-variance-authority';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, type To } from 'react-router-dom';
import { Loader } from './loader';

export const buttonVariants = cva(
  'disabled:cursor-not-allowed block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
  {
    variants: {
      variant: {
        default: ['text-textBaseSize', 'disabled:opacity-50'],
        simple: ['text-bgColor', 'bg-textColor', 'hover:bg-bgColor', 'hover:text-textColor'],
        simpleReverse: ['text-textColor', 'bg-bgColor'],
        simpleReverseWithBorder: [
          'text-textColor',
          'bg-bgColor',
          'border',
          'border-borderColor',
          'leading-4',
        ],
        main: [
          'border',
          'border-textColor',
          'text-textBaseSize',
          'text-bgColor',
          'bg-textColor',
          'hover:bg-bgColor',
          'hover:text-textColor',
          // Disabled reads as an outline, not a filled grey slab (reference grammar).
          'disabled:bg-bgColor',
          'disabled:text-borderColor',
          'disabled:border-borderColor',
          'leading-4',
          'text-center',
        ],
        secondary: [
          'border',
          'border-borderColor',
          'text-textBaseSize',
          'text-textColor',
          'hover:bg-textColor',
          'hover:text-bgColor',
          'disabled:bg-bgColor',
          'disabled:text-borderColor',
          'disabled:hover:bg-bgColor',
          'disabled:hover:text-borderColor',
          'leading-4',
          'text-center',
        ],
        underline: ['underline', 'disabled:text-borderColor'],
        underlineReverse: ['text-bgColor', 'underline', 'disabled:text-borderColor'],
        underlineWithColors: [
          'underline',
          'text-highlightColor',
          'disabled:text-borderColor',
          'visited:text-visitedLinkColor',
        ],
        strikeThrough: [
          'relative',
          'text-textBaseSize',
          'text-borderColor',
          'before:absolute',
          'before:top-1/2',
          'before:left-0',
          'before:w-full',
          'before:h-[1px]',
          'before:-translate-y-1/2',
          "before:content-['']",
          'before:bg-[var(--inactive)]',
          'disabled:cursor-not-allowed',
        ],
      },
      isLoading: {
        true: ['relative overflow-hidden'],
        false: [],
      },
      size: {
        // Inside a table row or a dense list.
        xs: ['px-1.5', 'py-px', 'text-micro', 'uppercase', 'tracking-label'],
        // Inside a panel — the default for everything that is not a page action.
        sm: ['px-2.5', 'py-1', 'text-micro', 'uppercase', 'tracking-label'],
        default: ['text-textBaseSize'],
        // Page-level actions only: Save, Release, Create.
        lg: ['py-2.5', 'px-4', 'text-textBaseSize'],
        giant: ['py-10', 'px-16', 'text-textGiantSmallSize', 'lg:text-textGiantSize'],
      },
    },
    compoundVariants: [
      {
        variant: 'main',
        isLoading: true,
        className: 'disabled:!bg-textColor disabled:!border-textColor',
      },
      {
        variant: 'secondary',
        isLoading: true,
        className: 'disabled:!bg-textColor disabled:!border-textColor disabled:!text-bgColor',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
      isLoading: false,
    },
  },
);

interface Props extends VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  children: React.ReactNode;
  loading?: boolean;
  loadingType?: 'default' | 'order-processing' | 'overlay';
  loadingReverse?: boolean;
  className?: string;
  /**
   * НЕОБЯЗАТЕЛЕН, И ЭТО ГЛАВНОЕ: без него получается `type='button'`, а не браузерный
   * `submit`. Отправку формы теперь надо ЗАЯВИТЬ — `type='submit'`.
   */
  type?: 'button' | 'submit' | 'reset';
  /**
   * Saved receipt at the control. Opt-in: passing the prop (even `false`) reserves the width of
   * both labels. `true` shows `saved ✓`, a string shows that word + ✓. Drive it with `useDoneFlash`.
   */
  done?: boolean | string;
  [k: string]: unknown;
}

/** Done: inverted back to white stock, ink text and edge, no hover swap. */
const DONE_CLASS: Partial<Record<string, string>> = {
  main: 'bg-bgColor text-textColor border-textColor hover:bg-bgColor hover:text-textColor',
  secondary: 'bg-bgColor text-textColor border-textColor hover:bg-bgColor hover:text-textColor',
  simple: 'bg-bgColor text-textColor hover:bg-bgColor hover:text-textColor',
};

/**
 * `const done = useDoneFlash(); … await save(); done.flash();` + `<Button done={done.on}>`.
 * `on` is true for `ms` (1.5 s) after the last `flash()`.
 */
export function useDoneFlash(ms = 1500) {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = useCallback(() => {
    clearTimeout(timer.current);
    setOn(true);
    timer.current = setTimeout(() => setOn(false), ms);
  }, [ms]);
  return { on, flash };
}

export function Button({
  asChild,
  children,
  loading = false,
  loadingType = 'default',
  loadingReverse = false,
  size,
  variant,
  className,
  type,
  done,
  ...props
}: Props) {
  // When asChild is true and loading, we can't use Slot because loading changes the content
  const Component = asChild && !loading ? Slot : 'button';

  // УМОЛЧАНИЕ ТИПА — `button`, а не браузерный `submit`.
  //
  // Голая `<button>` внутри `<form>` по спецификации HTML отправляет форму. Кнопка «прикрепить
  // файл» в карточке задачи одним кликом и открывала пикер, и сохраняла задачу: модалка правки
  // закрывалась, пикер уезжал вместе с ней. Тип кнопки не проверяется ни типами, ни сборкой —
  // единственное место, где эту ошибку можно закрыть на весь код разом, это сам примитив.
  //
  // Отправка теперь ЗАЯВЛЯЕТСЯ: `type='submit'` у кнопки, которая для этого и стоит (login,
  // workshop, custom-order-form). Аудит перед сменой умолчания показал, что неявных отправок в
  // приложении не осталось — все формы отправляются либо явным `submit`, либо обработчиком,
  // который сам зовёт `handleSubmit()`.
  //
  // При `asChild` тип НЕ ставится: там рендерится `<a>`/`<Link>`, у которого `type` значит
  // совсем другое (MIME-подсказка). Явно переданный проп при этом всё равно доезжает.
  const typeProps =
    Component === 'button' ? { type: type ?? 'button' } : type !== undefined ? { type } : {};

  // ЗАГРУЗКА ЗАПИРАЕТ КНОПКУ — ЗДЕСЬ, А НЕ НА МЕСТАХ ВЫЗОВА.
  //
  // `loading` рисовал крутилку, но кнопка оставалась НАЖИМАЕМОЙ, и второе нажатие запускало
  // вторую запись поверх летящей первой. На карточке задачи это стоило молча откаченного поля:
  // `UpdateTask` заменяет содержимое целиком, и вторая запись уносила соседнее поле таким, каким
  // его вернуло её собственное чтение, — то есть ДО первой правки.
  //
  // Что это правило принадлежит примитиву, видно по его же стилям: варианты `main` и `secondary`
  // описывают вид загрузки через `disabled:!bg-textColor` (`compoundVariants` выше) — то есть
  // рассчитаны на кнопку, которая при загрузке ЗАПЕРТА. Пока запора не было, эти правила не
  // применялись вовсе, и «грузящаяся» кнопка ещё и подсвечивалась по наведению.
  //
  // Двенадцать мест в админке передавали `loading` БЕЗ `disabled` — все двенадцать сохраняют или
  // отправляют, и ни одному из них повторное нажатие на полпути не нужно. Остальные писали
  // `disabled` руками рядом; объединение (`disabled || loading`) для них ничего не меняет.
  //
  // При `asChild` подмены не происходит: `Component` выше уже становится настоящей `<button>`,
  // как только `loading` истинно, — значит атрибут всегда садится на элемент, который его знает.
  const busyProps = loading ? { disabled: true } : {};

  // Opt-in only: other buttons keep their plain DOM. Slot needs a single child, so not with asChild.
  const hasDone = done !== undefined && Component === 'button';
  const isDone = hasDone && !loading && done !== false;
  const doneLabel = typeof done === 'string' ? done : 'saved';

  const renderContent = () => {
    if (hasDone && !loading) {
      // All three share one grid cell: the widest sets the width, so nothing jumps. The sizer always
      // holds the done word; the live span only gets it when done, so the change is announced.
      return (
        <span className='grid place-items-center'>
          <span
            aria-hidden={isDone}
            className={cn('col-start-1 row-start-1', isDone && 'invisible')}
          >
            {children}
          </span>
          <span aria-hidden className='invisible col-start-1 row-start-1 whitespace-nowrap'>
            {doneLabel} ✓
          </span>
          <span aria-live='polite' className='col-start-1 row-start-1 whitespace-nowrap'>
            {isDone ? `${doneLabel} ✓` : null}
          </span>
        </span>
      );
    }
    if (!loading) return children;

    if (loadingType === 'overlay') {
      return (
        <Loader type={loadingType} reverse={loadingReverse}>
          {children}
        </Loader>
      );
    }

    const shouldReverseLoader = variant === 'secondary' || variant === 'main';
    return <Loader type={loadingType} reverse={shouldReverseLoader} />;
  };

  return (
    <Component
      {...props}
      {...typeProps}
      {...busyProps}
      // twMerge only for done: its skin must beat the variant's bg, text and edge.
      className={
        hasDone
          ? cn(
              buttonVariants({ variant, isLoading: loading, size }),
              'transition-colors duration-150 ease-out motion-reduce:transition-none',
              isDone && DONE_CLASS[variant ?? 'default'],
              className,
            )
          : buttonVariants({ variant, isLoading: loading, size, className })
      }
      data-done={isDone || undefined}
    >
      {renderContent()}
    </Component>
  );
}

/** The back door's skin: one underlined label word, quiet until hovered. */
const BACK_LINK =
  'inline-block w-fit text-micro uppercase tracking-label text-labelColor underline underline-offset-2 hover:text-textColor disabled:cursor-not-allowed disabled:text-borderColor disabled:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';

/**
 * The one way back: `← word`, an underlined word at the top of a screen, a drawer, a wizard step or
 * a dead-end («not found») screen. `to` makes it a router link; without `to` it is a button that
 * runs `onClick`. `children` names where it leads (`tech cards`, `board`); it defaults to `back`.
 * The arrow is drawn here — callers never type `←`.
 */
export function BackLink({
  to,
  children = 'back',
  className,
  disabled,
  ...props
}: {
  to?: To;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  [k: string]: unknown;
}) {
  const content = (
    <>
      <span aria-hidden>←</span> {children}
    </>
  );
  if (to !== undefined) {
    return (
      <Link {...props} to={to} className={cn(BACK_LINK, className)}>
        {content}
      </Link>
    );
  }
  return (
    <button {...props} type='button' disabled={disabled} className={cn(BACK_LINK, className)}>
      {content}
    </button>
  );
}
