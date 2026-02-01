import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import AgendaPage from "../pages/AgendaPage";
import ConfigPage from "../pages/ConfigPage";
import LoginPage from "../pages/LoginPage";
import OrcamentosPage from "../pages/OrcamentosPage";
import { clearOwnerToken, getOwnerToken } from "../lib/api";

const AppRoutes = () => {
  const [token, setToken] = useState(() => getOwnerToken());

  useEffect(() => {
    const handleToken = () => setToken(getOwnerToken());
    window.addEventListener("owner-token-change", handleToken);
    window.addEventListener("owner-token-cleared", handleToken);
    return () => {
      window.removeEventListener("owner-token-change", handleToken);
      window.removeEventListener("owner-token-cleared", handleToken);
    };
  }, []);

  if (!token) {
    return <LoginPage onLogin={() => setToken(getOwnerToken())} />;
  }

  return (
    <Layout
      onLogout={() => {
        clearOwnerToken();
        setToken("");
      }}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/orcamentos" replace />} />
        <Route path="/orcamentos" element={<OrcamentosPage />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/config" element={<ConfigPage />} />
        <Route path="*" element={<Navigate to="/orcamentos" replace />} />
      </Routes>
    </Layout>
  );
};

export default AppRoutes;
