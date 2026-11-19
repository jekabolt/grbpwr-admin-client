import { requestHandler } from 'api/api';
import { createPlatformServiceClient } from 'api/proto-http/admin';

type Handler = Parameters<typeof createPlatformServiceClient>[0];

// The console's own client over the shared request handler (auth headers, error signals). A dev
// build under `VITE_AUTH_STUB` answers from the stub, which also sees the path (a GET names its
// team there); a production build drops that branch and the stub with it.
const handler: Handler = async (params, meta) => {
  if (import.meta.env.DEV && import.meta.env.VITE_AUTH_STUB && meta) {
    const { consoleStubAnswer } = await import('./dev-stub');
    await new Promise((r) => setTimeout(r, 250));
    const answer = consoleStubAnswer(meta.method, params.body, params.path);
    if (answer !== undefined) return answer;
  }
  return requestHandler(params, meta);
};

export const platformService = createPlatformServiceClient(handler);

export const consoleKeys = {
  all: ['console'] as const,
  teams: () => ['console', 'teams'] as const,
  features: () => ['console', 'features'] as const,
  team: (slug: string) => ['console', 'team', slug] as const,
};
