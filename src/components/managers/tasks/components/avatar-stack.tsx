import { cn } from 'lib/utility';
import { Avatar } from 'ui/components/avatar';

/**
 * РЯД ИСПОЛНИТЕЛЕЙ ВНАХЛЁСТ. При ОДНОМ имени выглядит ровно как одиночный `Avatar`, который
 * здесь стоял до мультиасайна, при НУЛЕ — как прежний пунктирный «?»: визуальная регрессия
 * нулевая, и это условие правки, а не приятный побочный эффект.
 *
 * Живёт в домене задач, а не в `ui/`: единственный потребитель — карточка и рейка задачи, а
 * переезд в общий кит ради одного вызова — лишний шов в параллельную ночь. Перенести можно
 * когда-нибудь потом, если о нём попросит fulfilment.
 *
 * `ring-1 ring-bgColor` рисует не украшение, а СТЫК: без него два ink-кружка внахлёст
 * сливаются в одну кляксу и «двое» читается как «один».
 */
export function AvatarStack({
  names,
  size = 20,
  max = 3,
  className,
}: {
  names: string[];
  size?: number;
  /** Сколько лиц показать до того, как остальные схлопнутся в «+N». */
  max?: number;
  className?: string;
}) {
  const people = names.filter((n) => !!n.trim());
  const title = people.length ? people.join(', ') : 'unassigned';

  if (people.length === 0) return <Avatar name='' size={size} className={className} />;

  const shown = people.slice(0, max);
  const rest = people.length - shown.length;

  return (
    <span className={cn('inline-flex shrink-0 items-center', className)} title={title}>
      {shown.map((name, i) => (
        <Avatar
          key={`${name}-${i}`}
          name={name}
          size={size}
          // Общая подпись висит на ряду; своя у каждого лица дала бы две разные подсказки
          // на одном месте, и какая из них покажется, решал бы курсор.
          title={title}
          className={cn(i > 0 && '-ml-1.5 ring-1 ring-bgColor')}
        />
      ))}
      {rest > 0 && (
        <span
          style={{ width: size, height: size, flex: `0 0 ${size}px` }}
          className='-ml-1.5 inline-flex items-center justify-center rounded-full bg-textColor text-nano leading-none text-bgColor ring-1 ring-bgColor'
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
