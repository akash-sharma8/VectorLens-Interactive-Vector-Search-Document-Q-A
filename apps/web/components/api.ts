export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  let response: Response;
  const isFile = body instanceof Blob;

  try {
    response = await fetch(`/api${path}`, {
      method: method || (body === undefined ? 'GET' : 'POST'),

      credentials: 'include',
      headers: {
        'X-Requested-With': 'VectorDB',
        'Content-Type': isFile
          ? 'application/pdf'
          : 'application/json',
      },

      ...(body === undefined
        ? {}
        : {
          body: isFile ? body : JSON.stringify(body),
        }),

      cache: 'no-store',
    });
  } catch {
    throw new Error(
      "Cannot reach the backend. Check that both development servers are running.",
    );
  }

  if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The backend did not return JSON. Check the API connection.",
    );
  }

  if (
    !response.ok ||
    (typeof data === "object" &&
      data !== null &&
      "error" in data)
  ) {
    throw new Error(
      typeof data === "object" &&
        data !== null &&
        "error" in data
        ? String(data.error)
        : `Request failed (${response.status})`,
    );
  }

  return data as T;
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong.";
}