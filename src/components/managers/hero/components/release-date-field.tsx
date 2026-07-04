import { ChangeEvent } from 'react';
import { useFormContext } from 'react-hook-form';
import InputField from 'ui/form/fields/input-field';

// The form stores releaseAt as an RFC3339 string (the contract's Timestamp).
// <input type="datetime-local"> speaks local "YYYY-MM-DDTHH:mm", so convert on
// the way in and out.
function isoToLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function localInputToIso(local: string): string {
  if (!local) return '';
  const d = new Date(local); // parsed as local time
  if (isNaN(d.getTime())) return '';
  return d.toISOString();
}

interface ReleaseDateFieldProps {
  /** Form path holding the RFC3339 string, e.g. `entities.3.drop.releaseAt`. */
  name: string;
  /** Current RFC3339 value from the form. */
  value?: string | null;
  label?: string;
}

/** A datetime picker bound to an RFC3339 string form field (drop release, etc.). */
export function ReleaseDateField({
  name,
  value,
  label = 'release date & time',
}: ReleaseDateFieldProps) {
  const { setValue } = useFormContext();

  return (
    <InputField
      type='datetime-local'
      name={name}
      label={label}
      value={isoToLocalInput(value)}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        setValue(name as any, localInputToIso(e.target.value), {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }}
    />
  );
}
