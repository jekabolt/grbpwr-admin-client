import { filesService } from 'components/managers/files/api/filesService';
import { messageOf } from 'components/managers/files/upload/engine';
import { DEFAULT_MAX_UPLOAD_BYTES } from 'components/managers/files/upload/queue';
import { browserUploadTransport } from 'components/managers/files/upload/transport';
import { formatBytes } from 'components/managers/files/utils/format';
import { FailNote, notifyFailure } from 'components/managers/production-runs/components/feedback';
import { cn } from 'lib/utility';
import { DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Close, Text } from 'ui';

// The supplier's invoice on a receipt: a pdf or a photo of it.
const ACCEPT = 'application/pdf,image/*';
const accepted = (f: File) => f.type === 'application/pdf' || f.type.startsWith('image/');

export type InvoiceFile = { id: number; name: string; size: number };

/**
 * Invoice upload state for the receive dialog. The file goes into the files library through the
 * library's own multipart transport (no second XHR); the dialog keeps only the library id.
 * Clearing drops the link, never the library file.
 */
export function useInvoiceUpload() {
  const [file, setFile] = useState<InvoiceFile | null>(null);
  const [uploading, setUploading] = useState<{ name: string; size: number } | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setUploading(null);
    setFile(null);
    setFail(null);
  }, []);

  // An upload still running when the dialog unmounts is abandoned, not left posting in the
  // background with nowhere to land.
  useEffect(() => () => abort.current?.abort(), []);

  const upload = useCallback(async (source: File) => {
    if (!accepted(source)) {
      setFail('pdf or image only');
      return;
    }
    if (source.size > DEFAULT_MAX_UPLOAD_BYTES) {
      setFail(`over ${formatBytes(DEFAULT_MAX_UPLOAD_BYTES)}`);
      return;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setFail(null);
    setFile(null);
    setUploading({ name: source.name, size: source.size });
    try {
      const preview = await browserUploadTransport.buildPreview(source).catch(() => null);
      if (controller.signal.aborted) return;
      const out = await browserUploadTransport.upload({
        source,
        name: source.name,
        preview,
        topicIds: [],
        newTopics: [],
        onProgress: () => {},
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      // Same bytes already in the library: the server still answers with the stored file.
      const id = out.fileId || out.duplicates[0]?.id || 0;
      if (!id) throw new Error('no file id');
      setFile({ id, name: source.name, size: source.size });
    } catch (e) {
      if (controller.signal.aborted) return;
      setFail(messageOf(e));
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setUploading(null);
      }
    }
  }, []);

  return { file, uploading: !!uploading, uploadingFile: uploading, fail, upload, clear };
}

type InvoiceUpload = ReturnType<typeof useInvoiceUpload>;

export function InvoiceDrop({ invoice }: { invoice: InvoiceUpload }) {
  const [over, setOver] = useState(false);
  const shown = invoice.file ?? invoice.uploadingFile;

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void invoice.upload(f);
  };

  return (
    <div className='flex flex-col gap-1'>
      {shown ? (
        <div className='flex items-center justify-between gap-2 border border-borderColor bg-hairline px-2 py-1.5'>
          <Text size='small' component='span' className='min-w-0 truncate'>
            {shown.name} · {invoice.uploading ? 'uploading…' : formatBytes(shown.size)}
          </Text>
          <Close size='sm' aria-label='remove invoice' onClick={invoice.clear} />
        </div>
      ) : (
        <label
          className={cn(
            'cursor-pointer border border-dashed border-borderColor px-3 py-3.5 text-center text-labelColor focus-within:border-textColor hover:border-textColor',
            over && 'border-textColor text-textColor',
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <Text size='small' component='span'>
            drop invoice · or click
          </Text>
          <input
            type='file'
            accept={ACCEPT}
            className='sr-only'
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void invoice.upload(f);
            }}
          />
        </label>
      )}
      <FailNote verb='not uploaded' text={invoice.fail} />
    </div>
  );
}

/**
 * ⎘ after a receipt's supplier doc: opens the attached invoice. The url is asked for on click
 * (GetLibraryFile signs a fresh one), never stored. The tab is opened synchronously so the
 * click still counts as a user gesture once the answer arrives.
 */
export function InvoiceMark({ fileId, name }: { fileId: number; name?: string }) {
  const open = async () => {
    const tab = window.open('', '_blank');
    try {
      const res = await filesService.getFile(fileId);
      const url = res.file?.url || res.file?.downloadUrl;
      if (!url) throw new Error('no link');
      if (tab) {
        tab.opener = null;
        tab.location.replace(url);
      } else {
        window.open(url, '_blank', 'noopener');
      }
    } catch (e) {
      tab?.close();
      notifyFailure('INVOICE', 'not opened', e);
    }
  };
  return (
    <Button
      type='button'
      variant='underline'
      size='xs'
      className='inline p-0 text-textBaseSize'
      title={name || 'invoice'}
      aria-label='open invoice'
      onClick={() => void open()}
    >
      ⎘
    </Button>
  );
}
