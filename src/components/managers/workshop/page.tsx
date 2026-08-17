import { zodResolver } from '@hookform/resolvers/zod';
import {
  UpdateWorkshopSettingsRequest,
  WorkshopSettings,
  googletype_Decimal,
} from 'api/proto-http/admin';
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
import { SEAM_ALLOWANCE_MAX_MM, validateSeamAllowanceStandard } from 'utils/seam-allowance';
import z from 'zod';
import {
  CLEAR_SETTING,
  useUpdateWorkshopSettings,
  useWorkshopSettings,
} from './useWorkshopSettings';

// Plausibility band for the cutting table, mirrored from entity.Min/MaxCuttingTableLengthCm. The
// floor is not «> 0»: the single likeliest mistake on this field is typing METRES into a field
// labelled centimetres, and «6» for a 6 m table passes a bare positivity check and then declares
// every раскладка too long — the exact silent-wrong-verdict failure this setting exists to prevent.
const MIN_TABLE_LENGTH_CM = 50;
const MAX_TABLE_LENGTH_CM = 5000;

// Ф4.8. Mirrored from entity.MaxStackHeightCm and from the named CHECK chk_workshop_settings_stack_height
// in 0283 — the three must move together. There is deliberately NO floor beyond «> 0»: unlike the
// table length, where metres-typed-as-centimetres is both likely and silently catastrophic, a stack
// limit is a single- or low-double-digit centimetre number to begin with, so any floor worth writing
// would start rejecting honest workshops — 2 cm is a truthful limit for someone cutting chiffon.
const MAX_STACK_HEIGHT_CM = 100;

// ───── ВРЕМЕННЫЙ МОСТ Ф4.8 — СНЯТЬ ПОСЛЕ ПЕРЕСБОРКИ ЗЕРКАЛА ПРОТО ─────────────────────────────
// max_stack_height_cm уже есть в proto бэкенда (admin.proto: WorkshopSettings #6,
// UpdateWorkshopSettingsRequest #4) и уже ходит по проводу, но сабмодуль зеркала ещё не пересобран,
// поэтому сгенерированные типы клиента про поле не знают. Эти два пересечения — ЕДИНСТВЕННОЕ место
// во всём экране, где это спрятано. После `make proto` УДАЛИТЬ ОБА типа и обращаться к полю
// напрямую: имя (maxStackHeightCm) и тип (googletype_Decimal) совпадают с генератором дословно, так
// что удаление не потребует никаких других правок.

const workshopSchema = z
  .object({
    // Every setting is a decimal-as-form-string, and '' means ABSENT — «не настроено» — never zero.
    cuttingTableLengthCm: z.string().optional().default(''),
    defaultSeamAllowanceMm: z.string().optional().default(''),
    maxStackHeightCm: z.string().optional().default(''),
  })
  .superRefine((data, ctx) => {
    const table = (data.cuttingTableLengthCm ?? '').trim();
    if (table) {
      const n = Number(table);
      const decimals = table.includes('.') ? table.split('.')[1].length : 0;
      if (!Number.isFinite(n)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'the table length is a number in centimetres',
          path: ['cuttingTableLengthCm'],
        });
      } else if (decimals > 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'no more than two decimal places — the column stores hundredths',
          path: ['cuttingTableLengthCm'],
        });
      } else if (n <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'zero means nothing here: to record "table not configured", clear the field instead of putting 0',
          path: ['cuttingTableLengthCm'],
        });
      } else if (n < MIN_TABLE_LENGTH_CM) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `the value is in CENTIMETRES — a 6 m table is 600, not 6 (minimum ${MIN_TABLE_LENGTH_CM})`,
          path: ['cuttingTableLengthCm'],
        });
      } else if (n > MAX_TABLE_LENGTH_CM) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `the longest spreading tables are about 50 m (${MAX_TABLE_LENGTH_CM} cm); this looks like an extra zero or millimetres`,
          path: ['cuttingTableLengthCm'],
        });
      }
    }
    const seam = validateSeamAllowanceStandard(data.defaultSeamAllowanceMm);
    if (seam) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: seam,
        path: ['defaultSeamAllowanceMm'],
      });
    }
    // Ф4.8. Note which neighbour this one sides with on ZERO: the table length, not the allowance.
    // A 0 cm allowance says something real; a 0 cm stack limit says «ни один настил не разрешён»,
    // which nobody means to configure — «предела нет» is an EMPTY field, and an empty field
    // withholds the verdict instead of failing every настил in the shop.
    const stack = (data.maxStackHeightCm ?? '').trim();
    if (stack) {
      const n = Number(stack);
      const decimals = stack.includes('.') ? stack.split('.')[1].length : 0;
      if (!Number.isFinite(n)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'the stack limit is a number in centimetres',
          path: ['maxStackHeightCm'],
        });
      } else if (decimals > 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'no more than two decimal places — the column stores hundredths',
          path: ['maxStackHeightCm'],
        });
      } else if (n <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'zero here would forbid every lay: to record "no limit", clear the field — then the height is simply not checked',
          path: ['maxStackHeightCm'],
        });
      } else if (n > MAX_STACK_HEIGHT_CM) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `the value is in CENTIMETRES — the longest knife takes about 30 cm, anything over ${MAX_STACK_HEIGHT_CM} is a unit mistake`,
          path: ['maxStackHeightCm'],
        });
      }
    }
  });

// The INPUT type, like every other form in this admin: zodResolver is typed
// Resolver<input, ctx, output>, so a form generic taken from z.infer (the output, where `.default('')`
// has already made both fields required) does not line up with it.
type WorkshopFormData = z.input<typeof workshopSchema>;

const EMPTY_FORM: WorkshopFormData = {
  cuttingTableLengthCm: '',
  defaultSeamAllowanceMm: '',
  maxStackHeightCm: '',
};

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
  const settings = data?.settings as WorkshopSettings | undefined;

  const initialValues = useMemo<WorkshopFormData>(
    () =>
      settings
        ? {
            // decimalToInput, not `|| ''` on a number: an unset setting reads as '' and a stored 0
            // reads as '0'. Any `||` here would fold the legal zero back into «не настроено».
            cuttingTableLengthCm: decimalToInput(settings.cuttingTableLengthCm),
            defaultSeamAllowanceMm: decimalToInput(settings.defaultSeamAllowanceMm),
            maxStackHeightCm: decimalToInput(settings.maxStackHeightCm),
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
      // Каждое поле перечислено ЯВНЫМ undefined: генерированные типы клиента НЕ опциональны, у них
      // `googletype_Decimal | undefined`, а не `?:`, так что пропущенный ключ — ошибка сборки, а не
      // «то же самое». JSON.stringify выбрасывает undefined, поэтому на проводе поля просто нет.
      cuttingTableLengthCm: undefined,
      defaultSeamAllowanceMm: undefined,
      maxStackHeightCm: undefined,
    };
    if (dirtyFields.cuttingTableLengthCm) {
      patch.cuttingTableLengthCm = inputToDecimal(values.cuttingTableLengthCm) ?? CLEAR_SETTING;
    }
    if (dirtyFields.defaultSeamAllowanceMm) {
      patch.defaultSeamAllowanceMm = inputToDecimal(values.defaultSeamAllowanceMm) ?? CLEAR_SETTING;
    }
    if (dirtyFields.maxStackHeightCm) {
      patch.maxStackHeightCm = inputToDecimal(values.maxStackHeightCm) ?? CLEAR_SETTING;
    }

    try {
      await update.mutateAsync(patch);
      showMessage('workshop settings saved', 'success');
    } catch (error) {
      // The server tags its refusals with the offending column (cutting_table_length_cm →
      // cuttingTableLengthCm), so pin them on the control the operator touched instead of raising a
      // toast that names a database field.
      const { applied, unmapped } = applyServerFieldErrors(error, form.setError);
      // Toast only what the form cannot show by itself: a refusal already pinned on its field would
      // otherwise be said twice, and a plain 4xx/5xx would be said nowhere.
      if (applied.length === 0 || unmapped.length > 0) {
        showMessage(fieldErrorSummary(error, "couldn't save the workshop settings"), 'error');
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
            workshop
          </Text>
          {settings?.updatedAt && (
            <Text variant='inactive' size='small'>
              changed by {settings.updatedBy || '—'} · {formatStamp(settings.updatedAt)}
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
                couldn't read the workshop settings — the fields below are empty not because nothing
                is configured. Refresh the page; saving right now is not allowed.
              </Text>
            </CalloutBox>
          )}
          <Section
            title='workshop constants'
            question='— what is true for the room and the equipment, not for an individual card or marker. An empty field means "not configured" and does NOT mean zero: without the setting the verdict is simply not given.'
          >
            <div className='grid grid-cols-1 gap-block sm:grid-cols-2'>
              <div className='flex flex-col gap-1'>
                <DecimalField
                  name='cuttingTableLengthCm'
                  label='cutting table length, cm'
                  maxDecimals={2}
                  placeholder='not configured'
                  disabled={!canEdit || isLoading || isError}
                />
                <Text size='micro' variant='label'>
                  The usable length of the spreading table. A marker can set a length of its own —
                  the workshop one is here so it doesn't have to be entered again on every marker.
                  Empty = not configured, and then the “marker is longer than the table” verdict is
                  not given at all. The value is in CENTIMETRES: a 6 m table is 600, not 6.
                </Text>
              </div>

              <div className='flex flex-col gap-1'>
                <DecimalField
                  name='defaultSeamAllowanceMm'
                  label='default seam allowance, mm'
                  maxDecimals={2}
                  placeholder='not configured'
                  disabled={!canEdit || isLoading || isError}
                />
                <Text size='micro' variant='label'>
                  A FALLBACK, not a copy: the card overrides it with its own “required seam
                  allowance”, and the marker itself overrides both with a field of its own. Empty =
                  there is no reference, and then the marker's seam allowance has nothing to be
                  compared with. 0 is a legal value and means “our patterns carry the cut line, no
                  offset needed”; to drop the reference, clear the field instead of putting zero.
                  From 0 to {SEAM_ALLOWANCE_MAX_MM} mm, to one decimal place.
                </Text>
              </div>

              <div className='flex flex-col gap-1'>
                <DecimalField
                  name='maxStackHeightCm'
                  label='stack height limit, cm'
                  maxDecimals={2}
                  placeholder='not configured'
                  disabled={!canEdit || isLoading || isError}
                />
                <Text size='micro' variant='label'>
                  CENTIMETRES, NOT A PLY COUNT — 30 plies of chiffon is 2 cm, 30 plies of heavy
                  coating is 30 cm; the knife is the constraint, and a knife cuts HEIGHT. Lay height
                  is computed as the ply count × the fabric thickness, and the thickness comes from
                  the article. One limit for the whole workshop. Empty = not configured, and then
                  the height is not checked at all — to drop the check, clear the field instead of
                  putting 0: zero would forbid every lay. The longest knife takes about 30 cm,
                  maximum {MAX_STACK_HEIGHT_CM}.
                </Text>
              </div>
            </div>
          </Section>
        </SectionStack>

        {canEdit && (
          <div className='flex items-center justify-between gap-3'>
            <Text variant='inactive' size='small'>
              {isDirty ? 'there are unsaved changes' : ' '}
            </Text>
            <Button
              type='submit'
              size='lg'
              variant='main'
              className='cursor-pointer uppercase'
              disabled={!isDirty || isError || update.isPending}
              loading={update.isPending}
            >
              save
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US');
}

export default WorkshopSettingsPage;
