import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/apiClient";
import Toast from "../components/Toast";

type OrcamentoResumo = {
  id: number;
  cliente_telefone?: string | null;
  cliente_nome?: string | null;
  status?: string | null;
  suggested_value?: number | null;
  valor_estimado?: number | null;
  created_at?: string | null;
  data_orcamento?: string | null;
};

const OrcamentosList = () => {
  const [orcamentos, setOrcamentos] = useState<OrcamentoResumo[]>([]);
  const [status, setStatus] = useState<string>("AGUARDANDO_APROVACAO_DONO");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    message: string;
    variant?: "success" | "error";
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    apiClient
      .get("/owner/orcamentos", {
        params: { status: "AGUARDANDO_APROVACAO_DONO" },
      })
      .then((response) => {
        if (!isMounted) return;
        setOrcamentos(response.data?.orcamentos ?? []);
        setStatus(response.data?.status ?? "AGUARDANDO_APROVACAO_DONO");
      })
      .catch(() => {
        if (!isMounted) return;
        setToast({ message: "Erro ao carregar orçamentos.", variant: "error" });
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Orçamentos</h2>
          <p className="muted">Status atual: {status}</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => window.location.reload()}
        >
          Atualizar
        </button>
      </div>
      {loading ? (
        <p className="muted">Carregando orçamentos...</p>
      ) : orcamentos.length === 0 ? (
        <p className="muted">Nenhum orçamento encontrado.</p>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Telefone</th>
                <th>Status</th>
                <th>Valor estimado</th>
                <th>Criado em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orcamentos.map((orcamento) => (
                <tr key={orcamento.id}>
                  <td>#{orcamento.id}</td>
                  <td>{orcamento.cliente_telefone || "—"}</td>
                  <td>{orcamento.status || "—"}</td>
                  <td>
                    {orcamento.valor_estimado ??
                      orcamento.suggested_value ??
                      "—"}
                  </td>
                  <td>
                    {orcamento.created_at || orcamento.data_orcamento
                      ? new Date(
                          orcamento.created_at ?? orcamento.data_orcamento ?? ""
                        ).toLocaleString("pt-BR")
                      : "—"}
                  </td>
                  <td>
                    <Link to={`/orcamentos/${orcamento.id}`} className="link">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </section>
  );
};

export default OrcamentosList;
