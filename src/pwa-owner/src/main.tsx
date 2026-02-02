import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes";
import "./styles/theme.css";
import "./styles/components.css";

const rootElement = document.getElementById("root");

if (rootElement) {
  const baseUrl = import.meta.env.BASE_URL || "/";
  createRoot(rootElement).render(
    <StrictMode>
      <BrowserRouter basename={baseUrl}>
        <AppRoutes />
      </BrowserRouter>
    </StrictMode>
  );
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}
