import { zodResolver } from '@hookform/resolvers/zod';
import { UpdateWorkshopSettingsRequest } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import { Form } from 'ui/form';
import DecimalField from 'ui/form/fields/decimal-field';
import { decimalToInput, inputToDecimal } from 'utils/decimal';
import { applyServerFieldErrors, fieldErrorSummary } from 'utils/field-errors';
import {
  SEAM_ALLOWANCE_MAX_CM,
  validateSeamAllowanceStandard,
} from 'utils/seam-allowance';
import z from 'zod';
import { CLEAR_SETTING, useUpdateWorkshopSettings, useWorkshopSettings } from './useWorkshopSettings';

// Plausibility band for the cutting table, mirrored from entity.Min/MaxCuttingTableLengthCm. The
// floor is not «> 0»: the single likeliest mistake on this field is typing METRES into a field
// labelled centimetres, and «6» for a 6 m table passes a bare positivity check and then declares
// every раскладка too long — the exact silent-wrong-verdict failure this setting exists to prevent.
const MIN_TABLE_LENGTH_CM = 50;
const MAX_TABLE_LENGTH_CM = 5000;

const workshopSchema = z
  .object({
    // Both settings are decimals-as-form-strings, and '' means ABSENT — «не настроено» — never zero.
    cuttingTableLengthCm: z.string().optional().default(''),
    defaultSeamAllowanceCm: z.string().optional().default(''),
  })
  .superRefine((data, ctx) => {
    const table = (data.cuttingTableLengthCm ?? '').trim();
    if (table) {
      const n = Number(table);
      const decimals = table.includes('.') ? table.split('.')[1].length : 0;
      if (!Number.isFinite(n)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'длина стола задаётся числом в сантиметрах',
          path: ['cuttingTableLengthCm'],
        });
      } else if (decimals > 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'не больше двух знаков после запятой — колонка хранит сотые',
          path: ['cuttingTableLengthCm'],
        });
      } else if (n <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'ноль здесь не значит ничего: чтобы записать «стол не настроен», очистите поле, а не ставьте 0',
          path: ['cuttingTableLengthCm'],
        });
      } else if (n < MIN_TABLE_LENGTH_CM) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `значение в САНТИМЕТРАХ — стол 6 м это 600, а не 6 (минимум ${MIN_TABLE_LENGTH_CM})`,
          path: ['cuttingTableLengthCm'],
        });
      } else if (n > MAX_TABLE_LENGTH_CM) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `самые длинные настилочные столы — около 50 м (${MAX_TABLE_LENGTH_CM} см); похоже на лишний ноль или миллиметры`,
          path: ['cuttingTableLengthCm'],
        });
      }
    }
    const seam = validateSeamAllowanceStandard(data.defaultSeamAllowanceCm);
    if (seam) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: seam,
        path: ['defaultSeamAllowanceCm'],
      });
    }
  });

// The INPUT type, like every other form in this admin: zodResolver is typed
// Resolver<input, ctx, output>, so a form generic taken from z.infer (the output, where `.default('')`
// has already made both fields required) does not line up with it.
type WorkshopFormData = z.input<typeof workshopSchema>;

const EMPTY_FORM: WorkshopFormData = { cuttingTableLengthCm: '', defaultSeamAllowanceCm: '' };

/**
 * ДОМ НАСТРОЕК ЦЕХА — the singleton row of shop-floor constants (workshop_settings, 0272 + 0277).
 *
 * Every field here is TRI-STATE and the middle state is the one that needs saying out loud:
 * EMPTY IS «НЕ НАСТРОЕНО», AND «НЕ НАСТРОЕНО» IS NOT ZERO. An unset table length means no length
 * verdict is available at all; comparing against 0 instead would tell a workshop that has merely not
 * filled the field in that every раскладка it lays is too long. The same law governs the default
 * allowance — with one difference that is the whole reason each setting owns a typed column instead
 * of sharing a key/value table: a ZERO allowance is a legal, meaningful setting («наши выкройки
 * несут линию кроя»), while a zero table length is nonsense. Two opposite floors, one screen.
 */
export function WorkshopSettingsPage() {
  const showMessage = useSnackBarStore((state) => state.showMessage);
  const { canWrite } = usePermissions();
  const canEdit = canWrite(SECTION.production);

  const { data, isLoading, isError } = useWorkshopSettings();
  const update = useUpdateWorkshopSettings();
  const settings = data?.settings;

  const initialValues = useMemo<WorkshopFormData>(
    () =>
      settings
        ? {
            // decimalToInput, not `|| ''` on a number: an unset setting reads as '' and a stored 0
            // reads as '0'. Any `||` here would fold the legal zero back into «не настроено».
            cuttingTableLengthCm: decimalToInput(settings.cuttingTableLengthCm),
            defaultSeamAllowanceCm: decimalToInput(settings.defaultSeamAllowanceCm),
          }
        : EMPTY_FORM,
    [settings],
  );

  const form = useForm<WorkshopFormData>({
    resolver: zodResolver(workshopSchema),
    values: initialValues,
    // A background refetch must not throw away what the operator is in the middle of typing: `values`
    // otherwise resets the whole form every time the query returns a new object.
    resetOptions: { keepDirtyValues: true },
  });

  const { dirtyFields } = form.formState;
  const isDirty = form.formState.isDirty;

  const handleSave = async (values: WorkshopFormData) => {
    // ONLY the settings this edit actually touched are named. An untouched setting is left ABSENT,
    // which the server reads as «оставь как было» — so two operators editing different settings do
    // not overwrite each other, and a screen that predates a future setting can never wipe it.
    // A blank touched field is sent as the EMPTY message, which is what CLEARS it; sending nothing
    // would silently leave the wrong number standing.
    const patch: UpdateWorkshopSettingsRequest = {
      cuttingTableLengthCm: undefined,
      defaultSeamAllowanceCm: undefined,
    };
    if (dirtyFields.cuttingTableLengthCm) {
      patch.cuttingTableLengthCm = inputToDecimal(values.cuttingTableLengthCm) ?? CLEAR_SETTING;
    }
    if (dirtyFields.defaultSeamAllowanceCm) {
      patch.defaultSeamAllowanceCm = inputToDecimal(values.defaultSeamAllowanceCm) ?? CLEAR_SETTING;
    }

    try {
      await update.mutateAsync(patch);
      showMessage('настройки цеха сохранены', 'success');
    } catch (error) {
      // The server tags its refusals with the offending column (cutting_table_length_cm →
      // cuttingTableLengthCm), so pin them on the control the operator touched instead of raising a
      // toast that names a database field.
      const { applied, unmapped } = applyServerFieldErrors(error, form.setError);
      // Toast only what the form cannot show by itself: a refusal already pinned on its field would
      // otherwise be said twice, and a plain 4xx/5xx would be said nowhere.
      if (applied.length === 0 || unmapped.length > 0) {
        showMessage(fieldErrorSummary(error, 'не удалось сохранить настройки цеха'), 'error');
      }
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSave)}
        className='flex flex-col gap-gutter px-2 pt-2 pb-8 lg:px-6'
      >
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor pb-3'>
          <Text variant='uppercase' size='large'>
            цех
          </Text>
          {settings?.updatedAt && (
            <Text variant='inactive' size='small'>
              изменено {settings.updatedBy || '—'} · {formatStamp(settings.updatedAt)}
            </Text>
          )}
        </div>

        <SectionStack>
          {/* Editing on top of a read that never arrived is how a setting gets wiped by someone who
              could not see it: the blank fields would look like «не настроено» and a save would make
              that true. The controls stay disabled until the row is actually in hand. */}
          {isError && (
            <CalloutBox tone='error'>
              <Text size='small'>
                не удалось прочитать настройки цеха — поля ниже пусты не потому, что настроек нет.
                Обновите страницу; сохранять сейчас нельзя.
              </Text>
            </CalloutBox>
          )}
          <Section
            title='постоянные цеха'
            question='— то, что верно для комнаты и оборудования, а не для отдельной карточки или раскладки. Пустое поле значит «не настроено» и НЕ значит ноль: без настройки вердикт просто не выносится.'
          >
            <div className='grid grid-cols-1 gap-block sm:grid-cols-2'>
              <div className='flex flex-col gap-1'>
                <DecimalField
                  name='cuttingTableLengthCm'
                  label='длина раскройного стола, см'
                  maxDecimals={2}
                  placeholder='не настроена'
                  disabled={!canEdit || isLoading || isError}
                />
                <Text size='micro' variant='label'>
                  Полезная длина стола настилки. Раскладка может задать свою длину — цеховая нужна,
                  чтобы не вводить её заново на каждой. Пусто = не настроена, и тогда вердикт
                  «раскладка длиннее стола» не выносится вовсе. Значение в САНТИМЕТРАХ: стол 6 м —
                  это 600, а не 6.
                </Text>
              </div>

              <div className='flex flex-col gap-1'>
                <DecimalField
                  name='defaultSeamAllowanceCm'
                  label='припуск по умолчанию, см'
                  maxDecimals={2}
                  placeholder='не настроен'
                  disabled={!canEdit || isLoading || isError}
                />
                <Text size='micro' variant='label'>
                  ФОЛБЭК, а не копия: карточка перебивает его своим «требуемым припуском», а сама
                  раскладка перебивает и то и другое собственным полем. Пусто = эталона нет, и тогда
                  припуск раскладки не с чем сравнивать. 0 — законное значение и значит «наши
                  выкройки несут линию кроя, офсет не нужен»; чтобы снять эталон, очистите поле, а не
                  ставьте ноль. От 0 до {SEAM_ALLOWANCE_MAX_CM} см, до двух знаков.
                </Text>
              </div>
            </div>
          </Section>
        </SectionStack>

        {canEdit && (
          <div className='flex items-center justify-between gap-3'>
            <Text variant='inactive' size='small'>
              {isDirty ? 'есть несохранённые изменения' : ' '}
            </Text>
            <Button
              type='submit'
              size='lg'
              variant='main'
              className='cursor-pointer uppercase'
              disabled={!isDirty || isError || update.isPending}
              loading={update.isPending}
            >
              сохранить
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default WorkshopSettingsPage;
