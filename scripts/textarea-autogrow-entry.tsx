// Точка входа пробы автовысоты многострочного поля (п.12 волны ux-0825).
//
// Здесь НАСТОЯЩИЕ примитивы: `ui/components/text-area` и обёртка RHF `ui/form/fields/textarea-field`
// — ни строки проверяемого не переписано. Стенд даёт только контекст формы (тот же
// `zodResolver`, что и на карточке) и пять мест, каждое из которых отвечает за свой вопрос:
//
//   #concept  — контролируемое поле RHF с rows={3}: главный случай, он же ловушка «+3 к трём».
//   #bare     — ГОЛОЕ неконтролируемое поле: props.value у него не меняется никогда, поэтому рост
//               при живой печати доказывает работу onInput, а не эффекта на value.
//   #nogrow   — autoGrow={false}: опт-аут обязан оставаться опт-аутом.
//   #minh     — className='min-h-24' (так живёт AI-описание операций): переопределение соседа
//               обязано пережить правку примитива.
//   #hidden   — поле в СПРЯТАННОЙ ветке (`hidden`, как вкладки тех-карты): спрятанное меряется в
//               ноль, и высота обязана приехать в момент показа, а не остаться враньём.
//
// Сабмит с пустым обязательным полем проверяет ОТДЕЛЬНОЕ: что слияние рефов не потеряло
// `field.ref` RHF — фокус на ошибке ходит именно через него.
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';

import Textarea from 'ui/components/text-area';
import TextareaField from 'ui/form/fields/textarea-field';

const schema = z.object({
  concept: z.string().min(1, 'required'),
  minh: z.string(),
  hidden: z.string(),
});
type FormData = z.infer<typeof schema>;

type Probe = {
  mount: (concept: string, hiddenText: string) => void;
  reveal: () => void;
  submit: () => void;
  /** Кто в фокусе — id элемента. */
  focused: () => string;
};
declare global {
  interface Window {
    __ta: Probe;
  }
}

const probe = {} as Probe;
window.__ta = probe;

function Harness({ concept, hiddenText }: { concept: string; hiddenText: string }) {
  const [hidden, setHidden] = useState(true);
  probe.reveal = () => setHidden(false);
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { concept, minh: '', hidden: hiddenText },
    mode: 'onSubmit',
  });
  probe.submit = () => {
    void form.handleSubmit(
      () => {},
      () => {},
    )();
  };
  return (
    <FormProvider {...form}>
      <form className='w-[600px] p-4'>
        <TextareaField name='concept' label='concept' rows={3} maxLength={2000} />
        {/* Голое поле, как его ставят в details-editor / sketch-tab: без RHF, неконтролируемое. */}
        <Textarea name='bare' rows={2} defaultValue='' />
        <Textarea name='nogrow' rows={2} autoGrow={false} defaultValue='' />
        <TextareaField name='minh' label='minh' rows={2} className='min-h-24' />
        <div hidden={hidden} data-probe='hidden-box'>
          <TextareaField name='hidden' label='hidden' rows={2} />
        </div>
      </form>
    </FormProvider>
  );
}

probe.focused = () => document.activeElement?.id ?? '';

probe.mount = (concept, hiddenText) => {
  const el = document.getElementById('root')!;
  el.innerHTML = '';
  createRoot(el).render(<Harness concept={concept} hiddenText={hiddenText} />);
};
