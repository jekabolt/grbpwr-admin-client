import { useFormContext, useWatch } from 'react-hook-form';
import { SelectField } from 'ui';
import type { TechCardFormData } from '../schema';
import {
  NO_BINDING_STYLE,
  NO_SEAM_CLASS,
  NO_TOPSTITCH_MODE,
  topstitchEdgeOptions,
  topstitchEdgePick,
} from './rules';
import { useStepWrite } from './use-step-write';

/**
 * The edge a topstitch step runs on (plain, turned, single or double hem), stored as the step's
 * seam kind. The select writes the kind; the class (and, on a step with no mode yet, the topstitch
 * anchor) follow in the same edit, so kind and class never disagree.
 */
export function TopstitchEdgeSelect({ index, className }: { index: number; className?: string }) {
  const { control } = useFormContext<TechCardFormData>();
  const write = useStepWrite(index);
  const seamKind = (
    (useWatch({ control, name: `operations.${index}.seamKind` }) ?? '') as string
  ).trim();
  const seamClass = (useWatch({ control, name: `operations.${index}.seamClass` }) ??
    NO_SEAM_CLASS) as string;
  const bindingStyle = (useWatch({ control, name: `operations.${index}.bindingStyle` }) ??
    NO_BINDING_STYLE) as string;
  const topstitchMode = (useWatch({ control, name: `operations.${index}.topstitchMode` }) ??
    NO_TOPSTITCH_MODE) as string;

  return (
    <SelectField
      name={`operations.${index}.seamKind`}
      label='edge'
      items={topstitchEdgeOptions(seamKind)}
      className={className}
      onAfterChange={(value) => {
        const next = topstitchEdgePick(String(value ?? ''), {
          seamKind,
          seamClass,
          bindingStyle,
          topstitchMode,
        });
        if (next.seamClass !== undefined) write('seamClass', next.seamClass);
        if (next.bindingStyle !== undefined) write('bindingStyle', next.bindingStyle);
        if (next.topstitchMode !== undefined) write('topstitchMode', next.topstitchMode);
      }}
    />
  );
}
