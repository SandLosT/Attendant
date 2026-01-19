import axios from "axios";

const TOKEN_KEY = "ownerToken";

export const getOwnerToken = () => localStorage.getItem(TOKEN_KEY) ?? "";
export const setOwnerToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
};

const apiClient = axios.create({
  baseURL: "/",
});

apiClient.interceptors.request.use((config) => {
  const token = getOwnerToken();
  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      const baseUrl = import.meta.env.BASE_URL || "/";
      const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
      window.location.assign(`${normalizedBase}token`);
    }
    return Promise.reject(error);
  }
);

export default apiClient;
