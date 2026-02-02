import Badge from "./Badge";
import Button from "./Button";

type TopBarProps = {
  onLogout: () => void;
};

const TopBar = ({ onLogout }: TopBarProps) => {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="row" style={{ gap: "12px" }}>
          <span className="topbar-title">Attendant — Painel do Dono</span>
          <Badge label="Online" variant="aprovado" />
        </div>
        <Button variant="ghost" onClick={onLogout}>
          Sair
        </Button>
      </div>
    </header>
  );
};

export default TopBar;
