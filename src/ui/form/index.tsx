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
  return (
    <FormItemContext.Provider value={{ id }}>
      <div className={cn('space-y-2', className)} ref={ref} {...props} />
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
    <Label ref={ref} className={cn(className)} htmlFor={formItemId} {...props}>
      <Text>{typeof props.children === 'string' ? props.children : null}</Text>
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

FormControl.displayName = 'FormControl';

function FormMessage({ className, children, ref, ...props }: any) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message) : children;

  if (!body) {
    return null;
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn('text-xs', className, {
        'text-errorColor': error,
      })}
      {...props}
    >
      {body}
    </p>
  );
}

FormMessage.displayName = 'FormMessage';

export { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, useFormField };
