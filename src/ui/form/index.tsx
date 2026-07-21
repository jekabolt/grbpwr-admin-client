import { Label } from '@radix-ui/react-label';
import { Slot } from '@radix-ui/react-slot';
import { cn } from 'lib/utility';
import { createContext, useContext, useId } from 'react';
import {
  Controller,
  type ControllerProps,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
} from 'react-hook-form';
import Text from 'ui/components/text';

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = createContext<FormFieldContextValue>({} as FormFieldContextValue);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = useContext(FormFieldContext);
  const itemContext = useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  const fieldState = getFieldState(fieldContext.name, formState);
  // Subscribe to errors so FormMessage/FormControl re-render when validation runs (RHF proxy)
  void formState.errors;

  if (!fieldContext) {
    throw new Error('useFormField must be used within a FormField');
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

type FormItemContextValue = {
  id: string;
};

const FormItemContext = createContext<FormItemContextValue>({} as FormItemContextValue);

function FormItem({
  className,
  ref,
  ...props
}: {
  className?: string;
  ref?: React.RefObject<HTMLDivElement>;
  [key: string]: unknown;
}) {
  const id = useId();
  // Stamp the field's dotted RHF path onto its wrapper. RHF's setFocus can reach the INPUT, but
  // scrolling/highlighting needs the whole labelled row, and some controls (Radix selects, pickers)
  // register no focusable ref at all. `[data-field="..."]` is the one selector that resolves any
  // field in the app from its error path — see focusFieldByPath in the tech-card editor.
  const fieldContext = useContext(FormFieldContext);
  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        className={cn('space-y-2', className)}
        data-field={fieldContext?.name}
        ref={ref}
        {...props}
      />
    </FormItemContext.Provider>
  );
}

FormItem.displayName = 'FormItem';

function FormLabel({
  className,
  ref,
  ...props
}: {
  className?: string;
  ref?: React.RefObject<HTMLLabelElement>;
  [key: string]: unknown;
}) {
  const { formItemId } = useFormField();

  return (
    <Label ref={ref} className={cn('leading-none', className)} htmlFor={formItemId} {...props}>
      <Text className='leading-none lowercase'>
        {typeof props.children === 'string' ? props.children : null}
      </Text>
    </Label>
  );
}

FormLabel.displayName = 'FormLabel';

function FormControl(props: any) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

  return (
    <Slot
      id={formItemId}
      aria-describedby={!error ? `${formDescriptionId}` : `${formDescriptionId} ${formMessageId}`}
      aria-invalid={!!error}
      {...props}
    />
  );
}

function FormDescription({ className, ref, ...props }: any) {
  const { formDescriptionId } = useFormField();

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn('text-muted-foreground text-textBaseSize', className)}
      {...props}
    />
  );
}

FormDescription.displayName = 'FormDescription';

FormControl.displayName = 'FormControl';

function FormMessage({ className, children, ref, ...props }: any) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message) : children;

  if (!body) {
    return null;
  }

  return (
    <Text
      ref={ref}
      id={formMessageId}
      className={cn('', className, {
        'text-error': error,
      })}
      {...props}
    >
      {body}
    </Text>
  );
}

FormMessage.displayName = 'FormMessage';

export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
};
