import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../api/apiClient";
import Toast from "../components/Toast";

type OrcamentoDetalhe = {
  id: number;
  cliente_id?: number | null;
  status?: string | null;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  valor_estimado?: number | null;
  suggested_value?: number | null;
  created_at?: string | null;
  data_orcamento?: string | null;
  detalhes?: string | null;
  data_preferida?: string | null;
  periodo_preferido?: string | null;
};

type ImagemInfo = {
  caminho?: string | null;
  nome_original?: string | null;
};

const OrcamentoDetail = () => {
  const { id } = useParams();
  const [orcamento, setOrcamento] = useState<OrcamentoDetalhe | null>(null);
  const [imagem, setImagem] = useState<ImagemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    variant?: "success" | "error";
  } | null>(null);
  const [dataAgendada, setDataAgendada] = useState("");
  const [observacao, setObservacao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [manualHoras, setManualHoras] = useState(2);
  const [manualMotivo, setManualMotivo] = useState("");
  const [valorFinal, setValorFinal] = useState("");
  const [dataAgendadaManual, setDataAgendadaManual] = useState("");
  const [observacaoManual, setObservacaoManual] = useState("");

  const fetchOrcamento = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/owner/orcamentos/${id}`);
      setOrcamento(response.data?.orcamento ?? null);
      setImagem(response.data?.imagem ?? null);
    } catch (error) {
      setToast({ message: "Erro ao carregar o orçamento.", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrcamento();
  }, [fetchOrcamento]);

  const imageUrl = useMemo(() => {
    if (!imagem?.caminho) return "";
    return imagem.caminho.startsWith("/") ? imagem.caminho : `/${imagem.caminho}`;
  }, [imagem]);

  const handleAprovar = async () => {
    if (!dataAgendada) {
      setToast({ message: "Informe a data agendada.", variant: "error" });
      return;
    }

    setActionLoading(true);
    try {
      await apiClient.post(`/owner/orcamentos/${id}/aprovar`, {
        data_agendada: dataAgendada,
        observacao,
      });
      setToast({ message: "Orçamento aprovado com sucesso." });
      await fetchOrcamento();
    } catch (error) {
      setToast({ message: "Erro ao aprovar o orçamento.", variant: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecusar = async () => {
    setActionLoading(true);
    try {
      await apiClient.post(`/owner/orcamentos/${id}/recusar`, {
        motivo: motivo || undefined,
      });
      setToast({ message: "Orçamento recusado." });
      await fetchOrcamento();
    } catch (error) {
      setToast({ message: "Erro ao recusar o orçamento.", variant: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleIntervir = async () => {
    if (!orcamento?.cliente_id) {
      setToast({ message: "Cliente inválido para intervenção.", variant: "error" });
      return;
    }

    setActionLoading(true);
    try {
      await apiClient.post(`/owner/clientes/${orcamento.cliente_id}/interferir`, {
        minutos: Math.max(1, manualHoras) * 60,
        motivo: manualMotivo || undefined,
      });
      setToast({ message: "Modo manual ativado." });
      await fetchOrcamento();
    } catch (error) {
      setToast({ message: "Erro ao ativar modo manual.", variant: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleFecharManual = async () => {
    setActionLoading(true);
    try {
      await apiClient.post(`/owner/orcamentos/${id}/fechar_manual`, {
        valor_final: valorFinal ? Number(valorFinal) : undefined,
        data_agendada: dataAgendadaManual || undefined,
        observacao: observacaoManual || undefined,
      });
      setToast({ message: "Orçamento fechado manualmente." });
      await fetchOrcamento();
    } catch (error) {
      setToast({ message: "Erro ao fechar manualmente.", variant: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <h2>Orçamento #{id}</h2>
        <Link to="/orcamentos" className="link">
          Voltar
        </Link>
      </div>

      {loading ? (
        <p className="muted">Carregando detalhes...</p>
      ) : !orcamento ? (
        <p className="muted">Nenhum detalhe encontrado.</p>
      ) : (
        <>
          <div className="detail-grid">
            <div>
              <h3>Status</h3>
              <p>{orcamento.status ?? "—"}</p>
            </div>
            <div>
              <h3>Cliente</h3>
              <p>{orcamento.cliente_nome ?? "—"}</p>
              <p className="muted">{orcamento.cliente_telefone ?? "—"}</p>
            </div>
            <div>
              <h3>Valor estimado</h3>
              <p>
                {orcamento.valor_estimado ??
                  orcamento.suggested_value ??
                  "—"}
              </p>
            </div>
            <div>
              <h3>Criado em</h3>
              <p>
                {orcamento.created_at || orcamento.data_orcamento
                  ? new Date(
                      orcamento.created_at ?? orcamento.data_orcamento ?? ""
                    ).toLocaleString("pt-BR")
                  : "—"}
              </p>
            </div>
          </div>

          <div className="detail-grid detail-grid-tight">
            <div>
              <h3>Preferência de data</h3>
              <p>{orcamento.data_preferida ?? "—"}</p>
            </div>
            <div>
              <h3>Período</h3>
              <p>{orcamento.periodo_preferido ?? "—"}</p>
            </div>
          </div>

          {imagem?.caminho && (
            <div className="image-preview">
              <h3>Última imagem</h3>
              <a href={imageUrl} target="_blank" rel="noreferrer" className="link">
                {imagem.nome_original || "Abrir imagem"}
              </a>
              <img src={imageUrl} alt="Última imagem enviada" />
            </div>
          )}

          <div className="actions">
            <div className="action-card">
              <h3>Aprovar</h3>
              <label className="field">
                <span>Data agendada</span>
                <input
                  type="date"
                  value={dataAgendada}
                  onChange={(event) => setDataAgendada(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Observação</span>
                <textarea
                  rows={3}
                  value={observacao}
                  onChange={(event) => setObservacao(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="primary-button"
                onClick={handleAprovar}
                disabled={actionLoading}
              >
                {actionLoading ? "Processando..." : "Aprovar"}
              </button>
            </div>
            <div className="action-card">
              <h3>Recusar</h3>
              <label className="field">
                <span>Motivo</span>
                <input
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                  placeholder="Informe o motivo"
                />
              </label>
              <button
                type="button"
                className="danger-button"
                onClick={handleRecusar}
                disabled={actionLoading}
              >
                {actionLoading ? "Processando..." : "Recusar"}
              </button>
            </div>
            <div className="action-card">
              <h3>Intervir (silenciar bot)</h3>
              <label className="field">
                <span>Horas</span>
                <input
                  type="number"
                  min={1}
                  value={manualHoras}
                  onChange={(event) => setManualHoras(Number(event.target.value))}
                />
              </label>
              <label className="field">
                <span>Motivo</span>
                <input
                  value={manualMotivo}
                  onChange={(event) => setManualMotivo(event.target.value)}
                  placeholder="Motivo (opcional)"
                />
              </label>
              <button
                type="button"
                className="secondary-button"
                onClick={handleIntervir}
                disabled={actionLoading}
              >
                {actionLoading ? "Processando..." : "Intervir"}
              </button>
            </div>
            <div className="action-card">
              <h3>Fechar manual</h3>
              <label className="field">
                <span>Valor final</span>
                <input
                  type="number"
                  value={valorFinal}
                  onChange={(event) => setValorFinal(event.target.value)}
                  placeholder="Valor final (opcional)"
                />
              </label>
              <label className="field">
                <span>Data agendada</span>
                <input
                  type="date"
                  value={dataAgendadaManual}
                  onChange={(event) => setDataAgendadaManual(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Observação</span>
                <textarea
                  rows={3}
                  value={observacaoManual}
                  onChange={(event) => setObservacaoManual(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="danger-button"
                onClick={handleFecharManual}
                disabled={actionLoading}
              >
                {actionLoading ? "Processando..." : "Fechar manual"}
              </button>
            </div>
          </div>
        </>
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

export default OrcamentoDetail;
