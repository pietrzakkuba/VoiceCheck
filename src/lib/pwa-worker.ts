export function withIsolation(response: Response): Response {
  if (response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function fetchWithOffline(
  request: Request,
  fetchResponse: (request: Request) => Promise<Response>,
  offlineResponse: () => Promise<Response | undefined>,
): Promise<Response> {
  try {
    return withIsolation(await fetchResponse(request));
  } catch (error) {
    if (request.mode !== 'navigate') throw error;
    const offline = await offlineResponse();
    if (!offline) throw error;
    return withIsolation(offline);
  }
}

export interface OfflineFirstDeps {
  /** Registration scope, e.g. `https://example.com/`. */
  scope: string;
  fetchResponse: (request: Request) => Promise<Response>;
  /** Precached response for a URL, or undefined when the URL is not precached (or missing from cache). */
  precached: (url: string) => Promise<Response | undefined>;
}

/**
 * Offline-first routing: precached files come from cache, in-scope navigations get the cached app shell
 * (client-side routing handles the path), everything else goes to the network.
 */
export async function handleOfflineFirst(request: Request, deps: OfflineFirstDeps): Promise<Response> {
  const cached = await deps.precached(request.url);
  if (cached) return withIsolation(cached);
  if (request.mode === 'navigate' && request.url.startsWith(deps.scope)) {
    const shell = await deps.precached(new URL('index.html', deps.scope).href);
    if (shell) return withIsolation(shell);
  }
  return fetchWithOffline(request, deps.fetchResponse, () => deps.precached(new URL('offline.html', deps.scope).href));
}

/** True when every precached cache key is present in the cache. */
export async function allPrecached(cacheKeys: Iterable<string>, has: (cacheKey: string) => Promise<boolean>): Promise<boolean> {
  const keys = [...cacheKeys];
  if (keys.length === 0) return false;
  const present = await Promise.all(keys.map(has));
  return present.every(Boolean);
}
