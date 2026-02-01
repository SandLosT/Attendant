import { NavLink } from "react-router-dom";

const Nav = () => {
  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        <NavLink to="/orcamentos">Orçamentos</NavLink>
        <NavLink to="/agenda">Agenda</NavLink>
        <NavLink to="/config">Config</NavLink>
      </div>
    </nav>
  );
};

export default Nav;
