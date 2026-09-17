const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(/\/$/, "");

type ApiErrorBody = {
  error?: { code?: string; message?: string; details?: unknown };
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function queryString(values: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // A proxy failure may not return JSON.
    }
    throw new ApiError(
      response.status,
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? `Request failed with status ${response.status}`,
      body?.error?.details,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
