const TOKEN_KEY = "owner_token";
const LEGACY_TOKEN_KEY = "ownerToken";

export const getOwnerToken = () =>
  localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY) ?? "";

export const setOwnerToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
  if (localStorage.getItem(LEGACY_TOKEN_KEY)) {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
  window.dispatchEvent(new Event("owner-token-change"));
};

export const clearOwnerToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  window.dispatchEvent(new Event("owner-token-cleared"));
};

type ApiFetchOptions = {
  method?: string;
  body?: unknown;
};

export const apiFetch = async <T>(path: string, options: ApiFetchOptions = {}): Promise<T> => {
  const token = getOwnerToken();
  const headers: HeadersInit = {};

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401) {
    clearOwnerToken();
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.erro || payload?.error || "Erro ao comunicar com o servidor.");
  }

  return payload as T;
};
