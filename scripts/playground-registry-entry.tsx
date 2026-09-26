// Точка входа пробы «реестр PLAYGROUND» (C-05): НАСТОЯЩИЕ модули реестра, а не их копии.
//
// Ничего проверяемого здесь не переписано: проба зовёт `wire()` / `validate()` / `recall()` самих
// плиток, `legacyStep` цепочки, ворота возможностей и сетку — и рисует сетку настоящим React в
// строку, чтобы «плитка приглушена и не открывается» мерилось по разметке, а не по функции,
// которую сетка могла бы перестать звать.
import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { legacyStep } from 'components/managers/tech-card/components/design/core/chain';
import {
  WorkflowGrid,
  workflowOpenable,
} from 'components/managers/tech-card/components/design/playground/grid';
import {
  WORKFLOWS,
  workflowByKey,
  workflowOfRun,
} from 'components/managers/tech-card/components/design/playground/registry';
import { EMPTY_DRAFT } from 'components/managers/tech-card/components/design/playground/registry/types';
import {
  openWorkflow,
  playgroundHistoryMatch,
} from 'components/managers/tech-card/components/design/playground/studio';
import { renderToStaticMarkup } from 'react-dom/server';

export {
  EMPTY_DRAFT,
  WORKFLOWS,
  legacyStep,
  openWorkflow,
  playgroundHistoryMatch,
  workflowByKey,
  workflowOfRun,
  workflowOpenable,
};

/** The grid as the person sees it, drawn by React into a string. */
export function gridMarkup(band: GetDesignBandResponse): string {
  return renderToStaticMarkup(<WorkflowGrid band={band} onOpen={() => {}} />);
}
