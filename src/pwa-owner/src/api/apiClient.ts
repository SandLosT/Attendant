import { apiFetch, getOwnerToken, setOwnerToken } from "../lib/api";

const apiClient = {
  async get(path: string, config?: { params?: Record<string, unknown> }) {
    const query = config?.params
      ? `?${new URLSearchParams(
          Object.entries(config.params)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, String(value)])
        ).toString()}`
      : "";
    const data = await apiFetch(`${path}${query}`);
    return { data };
  },
  async post(path: string, body?: unknown) {
    const data = await apiFetch(path, { method: "POST", body });
    return { data };
  },
};

export default apiClient;
export { getOwnerToken, setOwnerToken };
