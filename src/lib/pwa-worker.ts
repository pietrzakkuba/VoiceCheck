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
