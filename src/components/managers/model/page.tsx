import { common_Model } from 'api/proto-http/admin';
import { useModel } from 'components/managers/models/components/useModelQuery';
import { ReactNode } from 'react';
import { ModelFormProvider } from './components';
import { ModelPins } from './components/model-pins';

/**
 * The open model of the models pool: loads it (or nothing, for a new one) and holds the ONE form
 * that both the active card and the Model Info panel edit (`ModelFormProvider`). The caller keys it
 * by the active card, so switching cards starts a fresh form. `children` gets the loaded model for
 * the card's photos; `fallback` stands while it loads or when it is missing.
 */
export function ModelSession({
  id,
  pins,
  onCreated,
  onDeleted,
  onDirtyChange,
  fallback,
  children,
}: {
  /** Undefined = a new model. */
  id?: number;
  pins: ModelPins;
  onCreated: (id: number | undefined) => void;
  onDeleted: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  fallback: (state: 'loading' | 'missing') => ReactNode;
  children: (model: common_Model | undefined) => ReactNode;
}) {
  const isEditMode = id != null;
  const { data, isLoading, isError } = useModel(id);

  if (isEditMode && isLoading) return <>{fallback('loading')}</>;
  if (isEditMode && (isError || !data)) return <>{fallback('missing')}</>;

  return (
    <ModelFormProvider
      isEditMode={isEditMode}
      id={isEditMode ? String(id) : undefined}
      model={data}
      pins={pins}
      onCreated={onCreated}
      onDeleted={onDeleted}
      onDirtyChange={onDirtyChange}
    >
      {children(data)}
    </ModelFormProvider>
  );
}
