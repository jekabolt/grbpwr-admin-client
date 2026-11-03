import { reportApiError } from 'lib/observability';
import { createAdminServiceClient } from './proto-http/admin';
import { createAuthServiceClient } from './proto-http/auth';
import { createFrontendServiceClient } from './proto-http/frontend';

interface RequestHandlerParams {
  path: string;
  method: string;
  body: string | null;
}

interface ProtoMetaParams {
  service: string;
  method: string;
}

// A seam row outlives the page that accepted it (L16): the browser finishes a keepalive request after
// the tab is gone, up to 64 KiB across the page. The whole-card body is over that, and stays ordinary.
const OUTLIVES_THE_PAGE = new Set(['UpsertTechCardSeams', 'DeleteTechCardSeams']);
const KEEPALIVE_MAX_CHARS = 20_000;
const outlivesThePage = (meta: ProtoMetaParams | undefined, body: string | null): boolean =>
  !!meta && OUTLIVES_THE_PAGE.has(meta.method) && (body?.length ?? 0) <= KEEPALIVE_MAX_CHARS;

const send = async (
  { path, method, body }: RequestHandlerParams,
  signal?: AbortSignal,
  meta?: ProtoMetaParams,
) => {
  const authToken = localStorage.getItem('authToken');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authToken) {
    headers['Grpc-Metadata-Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const baseUrl = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');
    const url = `${baseUrl}/${path}`;
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal,
      keepalive: outlivesThePage(meta, body),
    });

    console.log('[BE] response: ', response.status, response.statusText);

    if (!response.ok) {
      let msg = `Error: ${response.status} - ${response.statusText}`;
      // google.rpc.Status details (grpc-gateway) carry BadRequest.fieldViolations — keep them so
      // forms can pin server validation errors on the exact field (see utils/field-errors.ts).
      let details: unknown[] | undefined;
      try {
        const text = await response.text();
        if (text) {
          if (response.headers.get('content-type')?.includes('application/json')) {
            const json = JSON.parse(text) as Record<string, unknown>;
            const s = ['message', 'error', 'detail']
              .map((k) => json[k])
              .find((v) => typeof v === 'string');
            if (s) msg = s as string;
            if (Array.isArray(json.details)) details = json.details;
          } else {
            msg = text;
          }
        }
      } catch {
        /* keep default */
      }
      const err = new Error(msg) as Error & { status?: number; details?: unknown[] };
      err.status = response.status;
      err.details = details;
      reportApiError(err, {
        route: meta ? `${meta.service}.${meta.method}` : path.split('?')[0],
        status: response.status,
        method,
      });
      throw err;
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Request failed: ${error}`);
  }
};

export const requestHandler = (params: RequestHandlerParams, meta?: ProtoMetaParams) =>
  send(params, undefined, meta);

/**
 * The admin client whose calls `signal` cancels: the generated client takes no `AbortSignal` of its
 * own, so a caller with a deadline (`SuggestPrompts`) builds one of these per call and aborts it —
 * the connection is closed, not merely ignored.
 */
export const abortableAdminService = (signal: AbortSignal) =>
  createAdminServiceClient((params, meta) => send(params, signal, meta));

export const frontendService = createFrontendServiceClient(requestHandler);
export const adminService = createAdminServiceClient(requestHandler);
export const authService = createAuthServiceClient(requestHandler);
