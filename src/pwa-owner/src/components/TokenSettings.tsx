import { useState } from "react";
import { getOwnerToken, setOwnerToken } from "../api/apiClient";

type TokenSettingsProps = {
  onSaved?: () => void;
};

const TokenSettings = ({ onSaved }: TokenSettingsProps) => {
  const [token, setToken] = useState(() => getOwnerToken());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setOwnerToken(token.trim());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
    onSaved?.();
  };

  return (
    <div className="token-card">
      <label className="token-label" htmlFor="owner-token">
        Owner Token
      </label>
      <input
        id="owner-token"
        className="token-input"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        placeholder="Cole o token do dono"
      />
      <button className="token-button" type="button" onClick={handleSave}>
        Salvar
      </button>
      {saved && <span className="token-saved">Token salvo!</span>}
    </div>
  );
};

export default TokenSettings;
