import { useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import Toast from "../components/Toast";
import { getOwnerToken, setOwnerToken } from "../lib/api";

const ConfigPage = () => {
  const [token, setToken] = useState(() => getOwnerToken());
  const [toast, setToast] = useState<{ message: string; variant?: "success" | "error" } | null>(
    null
  );

  const handleSave = () => {
    if (!token.trim()) {
      setToast({ message: "Informe um token válido.", variant: "error" });
      return;
    }
    setOwnerToken(token.trim());
    setToast({ message: "Token atualizado." });
  };

  return (
    <div className="col" style={{ gap: "20px" }}>
      <Card>
        <h2 style={{ marginTop: 0 }}>Configurações</h2>
        <p className="muted">Gerencie o token do dono e dados de acesso.</p>
        <label className="col" style={{ marginTop: "12px" }}>
          <span className="label">Token do dono</span>
          <input
            className="input"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Cole o token atualizado"
          />
        </label>
        <div className="row" style={{ marginTop: "16px" }}>
          <Button onClick={handleSave}>Salvar token</Button>
        </div>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Dicas rápidas</h3>
        <ul className="col" style={{ paddingLeft: "18px", margin: 0, gap: "8px" }}>
          <li className="muted">Use o botão "Sair" para remover o token deste dispositivo.</li>
          <li className="muted">Orçamentos pendentes precisam de ação para liberar agenda.</li>
          <li className="muted">Gerar agenda cria slots futuros para novos pedidos.</li>
        </ul>
      </Card>

      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
    </div>
  );
};

export default ConfigPage;
