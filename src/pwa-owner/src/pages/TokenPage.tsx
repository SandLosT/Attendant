import { useNavigate } from "react-router-dom";
import TokenSettings from "../components/TokenSettings";

const TokenPage = () => {
  const navigate = useNavigate();

  return (
    <section className="token-page">
      <div className="card token-card-wrapper">
        <h2>Configurar Owner Token</h2>
        <p className="muted">
          Informe o token do dono para autorizar chamadas ao backend.
        </p>
        <TokenSettings onSaved={() => navigate("/orcamentos")} />
      </div>
    </section>
  );
};

export default TokenPage;
