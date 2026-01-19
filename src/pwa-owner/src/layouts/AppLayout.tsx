import { NavLink, Outlet } from "react-router-dom";
import TokenSettings from "../components/TokenSettings";
import "../styles.css";

const AppLayout = () => {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Attendant Owner</div>
        <nav className="nav">
          <NavLink to="/orcamentos" className="nav-link">
            Orçamentos
          </NavLink>
          <NavLink to="/agenda" className="nav-link">
            Agenda
          </NavLink>
          <NavLink to="/token" className="nav-link">
            Token
          </NavLink>
        </nav>
        <TokenSettings />
      </aside>
      <div className="content">
        <header className="topbar">
          <h1>Painel do Dono</h1>
          <span className="status-pill">PWA Base</span>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
