import { adminService } from 'api/api';
import { getBase64File } from 'lib/features/getBase64';
import { useSnackBarStore } from 'lib/stores/store';
import { useId, useRef, useState } from 'react';
import {
  MAX_PATTERN_BYTES,
  MAX_PATTERN_FILENAME,
  isPdfFile,
  patternUploadErrorMessage,
  stripDataUrlPrefix,
} from 'utils/pattern';
import { Button } from './button';
import Text from './text';

export type UploadedPattern = { url: string; filename: string; sizeBytes: number };

type Props = {
  // Called once the PDF is in object storage. The caller holds it as a pending entry in
  // form state and only persists it when the parent (tech card / fitting) is saved.
  onUploaded: (pattern: UploadedPattern) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
};

// Shared PDF выкройка upload control (§1): pick → validate (PDF, ≤25 MB) → base64 →
// Admin.UploadPattern → hand the {url, filename, sizeBytes} back to the caller. Errors are
// mapped (bad file vs server) and surfaced inline + via snackbar. Stateless beyond the
// in-flight upload — it never touches form state itself.
export function PatternUploadButton({ onUploaded, label, disabled, className }: Props) {
  const { showMessage } = useSnackBarStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `pattern-upload-${useId().replace(/:/g, '')}`;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!isPdfFile(file)) {
      setError('Только PDF.');
      return;
    }
    if (file.size > MAX_PATTERN_BYTES) {
      setError('Файл больше 25 МБ.');
      return;
    }

    setUploading(true);
    try {
      const raw = stripDataUrlPrefix(await getBase64File(file));
      const filename = file.name.slice(0, MAX_PATTERN_FILENAME);
      const res = await adminService.UploadPattern({ raw, filename });
      onUploaded({
        url: res.url ?? '',
        filename: res.filename ?? filename,
        // size_bytes is an int64 — grpc-gateway serialises it as a STRING in JSON (despite the
        // generated `number` type). Coerce so the form holds a real number (z.number() rejects
        // a string, which silently blocks the whole save).
        sizeBytes: Number(res.sizeBytes ?? file.size) || 0,
      });
    } catch (e) {
      const msg = patternUploadErrorMessage(e);
      setError(msg);
      showMessage(msg, 'error');
      console.error('UploadPattern failed', e);
    } finally {
      setUploading(false);
      // Reset so re-picking the same file re-fires onChange.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        id={inputId}
        type='file'
        accept='application/pdf,.pdf'
        className='sr-only'
        disabled={disabled || uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <Button
        type='button'
        variant='secondary'
        className='uppercase'
        loading={uploading}
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
      >
        {label ?? '+ загрузить PDF'}
      </Button>
      {error && (
        <Text size='small' className='mt-1 block text-error'>
          {error}
        </Text>
      )}
    </div>
  );
}
