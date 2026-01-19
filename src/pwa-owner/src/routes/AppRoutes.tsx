import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "../layouts/AppLayout";
import AgendaList from "../pages/AgendaList";
import OrcamentoDetail from "../pages/OrcamentoDetail";
import OrcamentosList from "../pages/OrcamentosList";
import TokenPage from "../pages/TokenPage";

const AppRoutes = () => (
  <Routes>
    <Route path="/token" element={<TokenPage />} />
    <Route element={<AppLayout />}>
      <Route path="/" element={<Navigate to="/orcamentos" replace />} />
      <Route path="/orcamentos" element={<OrcamentosList />} />
      <Route path="/orcamentos/:id" element={<OrcamentoDetail />} />
      <Route path="/agenda" element={<AgendaList />} />
    </Route>
  </Routes>
);

export default AppRoutes;
