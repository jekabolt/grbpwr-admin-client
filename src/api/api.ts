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

export const requestHandler = async (
  { path, method, body }: RequestHandlerParams,
  { method: serviceMethod }: ProtoMetaParams, // eslint-disable-line @typescript-eslint/no-unused-vars
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
    });

    console.log('[BE] response: ', response.status, response.statusText);

    if (!response.ok) {
      let errorMessage = `Error: ${response.status} - ${response.statusText}`;
      try {
        const contentType = response.headers.get('content-type');
        const text = await response.text();
        if (contentType?.includes('application/json') && text) {
          const json = JSON.parse(text) as Record<string, unknown>;
          const msg =
            typeof json.message === 'string'
              ? json.message
              : typeof json.error === 'string'
                ? json.error
                : typeof json.detail === 'string'
                  ? json.detail
                  : undefined;
          if (msg) errorMessage = msg;
        } else if (text) {
          errorMessage = text;
        }
      } catch {
        // keep default errorMessage
      }
      const err = new Error(errorMessage) as Error & { status?: number };
      err.status = response.status;
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

export const frontendService = createFrontendServiceClient(requestHandler);
export const adminService = createAdminServiceClient(requestHandler);
export const authService = createAuthServiceClient(requestHandler);
