import { useState, type FormEvent } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import { setOwnerToken } from "../lib/api";

type LoginPageProps = {
  onLogin: () => void;
};

const LoginPage = ({ onLogin }: LoginPageProps) => {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!token.trim()) {
      setError("Informe o token para continuar.");
      return;
    }
    setOwnerToken(token.trim());
    onLogin();
  };

  return (
    <div className="app" style={{ justifyContent: "center" }}>
      <div className="container">
        <Card>
          <form className="col" onSubmit={handleSubmit}>
            <h2>Bem-vindo ao painel</h2>
            <p className="muted">Cole seu token e entre.</p>
            <label className="col">
              <span className="label">Token do dono</span>
              <input
                className="input"
                value={token}
                onChange={(event) => {
                  setToken(event.target.value);
                  setError("");
                }}
                placeholder="Cole o token aqui"
              />
            </label>
            {error && <span className="badge badge-recusado">{error}</span>}
            <Button type="submit">Entrar</Button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
