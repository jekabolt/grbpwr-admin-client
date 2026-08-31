import { Dispatch, FC, ReactNode, createContext, useReducer } from 'react';

import { TooltipProvider } from 'ui/components/tooltip';

const initialContextValue = {};

interface IState {}
type ActionsType = '';

const reducer = (state: IState, action: { type: ActionsType; payload: string }) => {
  switch (action.type) {
    case '':
    default:
      return state;
  }
};

interface IContextValue {
  state: IState;
  dispatch: Dispatch<{ type: ActionsType; payload: string }>;
}
export const Context = createContext<IContextValue>({
  state: initialContextValue,
  dispatch: () => null,
});

export const ContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialContextValue);

  return (
    <Context.Provider value={{ state, dispatch }}>
      {/* ОДИН `TooltipProvider` НА ВСЁ ПРИЛОЖЕНИЕ, и это починка дефекта, а не украшение.
          *
          * `ui/components/tooltip.tsx` — это сырой Radix: `Tooltip.Root` первым делом читает контекст
          * провайдера (`@radix-ui/react-tooltip@1.2.8`, dist/index.mjs:81) и БРОСАЕТ
          * «`Tooltip` must be used within `TooltipProvider`», если провайдера над ним нет. Не
          * предупреждает — бросает, то есть уносит поддерево в ближайшую границу ошибок, а ближайшая
          * здесь одна и она корневая (`src/index.tsx`): экран целиком заменяется на «Something went
          * wrong / Try again».
          *
          * ДО ЭТОГО провайдер ставили поштучно — по одному на экран (`index.tsx` на группу маршрутов
          * бухгалтерии, `kinds-strip`, `labels-field`, `measurements-fields`). Такой уговор ничем не
          * проверяется, поэтому его забывают.
          *
          * КАК ЭТО ВЫСТРЕЛИЛО (жалоба владельца, круг 5, V-3: «при попытке удалить медиа из мудборда
          * такая ошибка "Tooltip must be used within TooltipProvider"»). Носителем был
          * `concept-section.tsx`: он брал `Tooltip` без обёртки, и подсказка там монтировалась
          * УСЛОВНО — только когда у карточки не осталось ни одного говорящего указания. Пока
          * указания были, ветка не исполнялась и дефект не был виден; удаление картинки из мудборда
          * уносит её указания (`mood-board.tsx` → `confirmRemove` → `callouts.removeOn`), счётчик
          * падает до нуля, подсказка монтируется ПЕРВЫЙ раз за сессию — и падает вся вкладка.
          *
          * ⚠ ТОГО НОСИТЕЛЯ БОЛЬШЕ НЕТ: блок «read the callouts» снят по V-16, а `concept-section.tsx`
          * УДАЛЁН С ДИСКА — не «опустошён», файла нет вовсе. Искать там нечего, но КЛАСС дефекта жив,
          * и провайдер снят не поэтому.
          * `Tooltip` без собственного провайдера берут ещё `caveat-badge`, `accounts-table`,
          * `periods-table` и `label-placement-pictogram`; каждый из них рисуется по данным, то есть
          * взводится так же незаметно. Один провайдер наверху закрывает их все и все будущие.
          *
          * Провайдер стоит здесь, потому что это композиция провайдеров всего приложения, и он ничего
          * не стоит: Radix рисует только `children` плюс контекст, DOM не добавляется. Локальные
          * провайдеры ниже остаются законными — вложение разрешено, внутренний просто переопределяет
          * тайминг для своей группы. Значения совпадают с теми, что уже стояли на бухгалтерии, чтобы
          * поведение подсказок нигде не поехало. */}
      <TooltipProvider delayDuration={200} skipDelayDuration={150}>
        {children}
      </TooltipProvider>
    </Context.Provider>
  );
};
