import { useCallback, useEffect, useMemo, useState } from "react";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Card from "../components/Card";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import { apiFetch } from "../lib/api";
import { formatCurrency, formatDate, formatDateTime } from "../lib/format";

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

type OrcamentoDetalhe = OrcamentoResumo & {
  cliente_id?: number | null;
  detalhes?: string | Record<string, unknown> | null;
  data_preferida?: string | null;
  periodo_preferido?: string | null;
  match_score?: number | null;
};

type ImagemInfo = {
  caminho?: string | null;
  nome_original?: string | null;
};

const statusOptions = [
  { label: "Pendente", value: "PENDENTE", variant: "pendente" as const },
  { label: "Aprovado", value: "APROVADO", variant: "aprovado" as const },
  { label: "Recusado", value: "RECUSADO", variant: "recusado" as const },
];

const OrcamentosPage = () => {
  const [orcamentos, setOrcamentos] = useState<OrcamentoResumo[]>([]);
  const [status, setStatus] = useState(statusOptions[0].value);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; variant?: "success" | "error" } | null>(
    null
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<OrcamentoDetalhe | null>(null);
  const [imagem, setImagem] = useState<ImagemInfo | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modal, setModal] = useState<"detalhes" | "aprovar" | "recusar" | "manual" | null>(
    null
  );
  const [dataAgendada, setDataAgendada] = useState("");
  const [observacao, setObservacao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [manualMinutes, setManualMinutes] = useState(120);
  const [manualMotivo, setManualMotivo] = useState("");
  const [manualValorFinal, setManualValorFinal] = useState("");
  const [manualData, setManualData] = useState("");
  const [manualObs, setManualObs] = useState("");

  const fetchOrcamentos = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch<{ orcamentos: OrcamentoResumo[] }>(
        `/owner/orcamentos?status=${status}`
      );
      setOrcamentos(response.orcamentos ?? []);
    } catch (error) {
      setToast({ message: (error as Error).message, variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchOrcamentos();
  }, [fetchOrcamentos]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const response = await apiFetch<{ orcamento: OrcamentoDetalhe; imagem: ImagemInfo | null }>(
        `/owner/orcamentos/${id}`
      );
      setDetail(response.orcamento ?? null);
      setImagem(response.imagem ?? null);
    } catch (error) {
      setToast({ message: (error as Error).message, variant: "error" });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const parsedDetalhes = useMemo(() => {
    if (!detail?.detalhes) return null;
    if (typeof detail.detalhes === "object") return detail.detalhes;
    try {
      return JSON.parse(detail.detalhes);
    } catch (error) {
      return null;
    }
  }, [detail]);

  const matchScore = useMemo(() => {
    if (!detail) return null;
    if (detail.match_score !== null && detail.match_score !== undefined) {
      return detail.match_score;
    }
    if (parsedDetalhes && typeof parsedDetalhes === "object" && "match_score" in parsedDetalhes) {
      return (parsedDetalhes as { match_score?: number }).match_score ?? null;
    }
    return null;
  }, [detail, parsedDetalhes]);

  const handleOpenDetail = (id: number) => {
    setSelectedId(id);
    setModal("detalhes");
  };

  const handleAprovar = async () => {
    if (!selectedId) return;
    if (!dataAgendada) {
      setToast({ message: "Informe a data agendada.", variant: "error" });
      return;
    }
    try {
      await apiFetch(`/owner/orcamentos/${selectedId}/aprovar`, {
        method: "POST",
        body: { data_agendada: dataAgendada, observacao: observacao || undefined },
      });
      setToast({ message: "Orçamento aprovado com sucesso." });
      setModal(null);
      setDataAgendada("");
      setObservacao("");
      await fetchOrcamentos();
      await loadDetail(selectedId);
    } catch (error) {
      setToast({ message: (error as Error).message, variant: "error" });
    }
  };

  const handleRecusar = async () => {
    if (!selectedId) return;
    try {
      await apiFetch(`/owner/orcamentos/${selectedId}/recusar`, {
        method: "POST",
        body: { motivo: motivo || undefined },
      });
      setToast({ message: "Orçamento recusado." });
      setModal(null);
      setMotivo("");
      await fetchOrcamentos();
      await loadDetail(selectedId);
    } catch (error) {
      setToast({ message: (error as Error).message, variant: "error" });
    }
  };

  const handleAssumir = async () => {
    if (!detail?.cliente_id) {
      setToast({ message: "Cliente não disponível.", variant: "error" });
      return;
    }
    try {
      await apiFetch(`/owner/clientes/${detail.cliente_id}/takeover`, {
        method: "POST",
        body: { minutes: manualMinutes },
      });
      setToast({ message: "Conversa assumida manualmente." });
    } catch (error) {
      setToast({ message: (error as Error).message, variant: "error" });
    }
  };

  const handleInterferir = async () => {
    if (!detail?.cliente_id) {
      setToast({ message: "Cliente não disponível.", variant: "error" });
      return;
    }
    try {
      await apiFetch(`/owner/clientes/${detail.cliente_id}/interferir`, {
        method: "POST",
        body: { minutos: manualMinutes, motivo: manualMotivo || undefined },
      });
      setToast({ message: "Modo manual ativado." });
    } catch (error) {
      setToast({ message: (error as Error).message, variant: "error" });
    }
  };

  const handleFecharManual = async () => {
    if (!selectedId) return;
    try {
      await apiFetch(`/owner/orcamentos/${selectedId}/fechar_manual`, {
        method: "POST",
        body: {
          valor_final: manualValorFinal ? Number(manualValorFinal) : undefined,
          data_agendada: manualData || undefined,
          observacao: manualObs || undefined,
        },
      });
      setToast({ message: "Orçamento fechado manualmente." });
      setModal(null);
      setManualValorFinal("");
      setManualData("");
      setManualObs("");
      await fetchOrcamentos();
      await loadDetail(selectedId);
    } catch (error) {
      setToast({ message: (error as Error).message, variant: "error" });
    }
  };

  const imageUrl = useMemo(() => {
    if (!imagem?.caminho) return "";
    return imagem.caminho.startsWith("/") ? imagem.caminho : `/${imagem.caminho}`;
  }, [imagem]);

  return (
    <div className="col" style={{ gap: "20px" }}>
      <Card>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="col">
            <h2 style={{ margin: 0 }}>Orçamentos</h2>
            <p className="muted">Acompanhe pedidos recentes e tome ações rápidas.</p>
          </div>
          <Button variant="ghost" onClick={fetchOrcamentos}>
            Atualizar
          </Button>
        </div>
        <div className="tabs" style={{ marginTop: "16px" }}>
          {statusOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`tab ${status === option.value ? "active" : ""}`}
              onClick={() => setStatus(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Card>

      {loading ? (
        <Card>
          <div className="col">
            <div className="skeleton" style={{ height: "20px", width: "60%" }} />
            <div className="skeleton" style={{ height: "16px", width: "40%" }} />
            <div className="skeleton" style={{ height: "120px" }} />
          </div>
        </Card>
      ) : orcamentos.length === 0 ? (
        <Card>
          <p className="muted">Nenhum orçamento encontrado para este status.</p>
        </Card>
      ) : (
        <div className="grid grid-2">
          {orcamentos.map((orcamento) => {
            const statusVariant =
              orcamento.status === "APROVADO"
                ? "aprovado"
                : orcamento.status === "RECUSADO"
                  ? "recusado"
                  : "pendente";

            return (
              <Card key={orcamento.id}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div className="col">
                    <strong>{orcamento.cliente_nome || "Cliente"}</strong>
                    <span className="muted">{orcamento.cliente_telefone || "—"}</span>
                  </div>
                  <Badge label={orcamento.status || "PENDENTE"} variant={statusVariant} />
                </div>
                <div className="grid" style={{ marginTop: "16px" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="muted">Valor estimado</span>
                    <strong>
                      {formatCurrency(
                        orcamento.valor_estimado ?? orcamento.suggested_value ?? null
                      )}
                    </strong>
                  </div>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="muted">Criado em</span>
                    <span>{formatDateTime(orcamento.created_at ?? orcamento.data_orcamento)}</span>
                  </div>
                </div>
                <Button
                  style={{ marginTop: "18px", width: "100%" }}
                  onClick={() => handleOpenDetail(orcamento.id)}
                >
                  Ver detalhes
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        title={`Orçamento #${selectedId ?? ""}`}
        open={modal === "detalhes"}
        onClose={() => setModal(null)}
      >
        {detailLoading ? (
          <div className="col">
            <div className="skeleton" style={{ height: "18px" }} />
            <div className="skeleton" style={{ height: "120px" }} />
          </div>
        ) : !detail ? (
          <p className="muted">Não foi possível carregar os detalhes.</p>
        ) : (
          <div className="col" style={{ gap: "16px" }}>
            <div className="grid grid-2">
              <div className="col">
                <span className="label">Cliente</span>
                <strong>{detail.cliente_nome || "—"}</strong>
                <span className="muted">{detail.cliente_telefone || "—"}</span>
              </div>
              <div className="col">
                <span className="label">Status</span>
                <Badge label={detail.status || "PENDENTE"} variant="info" />
              </div>
              <div className="col">
                <span className="label">Valor estimado</span>
                <strong>
                  {formatCurrency(detail.valor_estimado ?? detail.suggested_value ?? null)}
                </strong>
              </div>
              <div className="col">
                <span className="label">Criado em</span>
                <span>{formatDateTime(detail.created_at ?? detail.data_orcamento)}</span>
              </div>
              <div className="col">
                <span className="label">Data preferida</span>
                <span>{formatDate(detail.data_preferida)}</span>
              </div>
              <div className="col">
                <span className="label">Período</span>
                <span>{detail.periodo_preferido || "—"}</span>
              </div>
            </div>

            {matchScore !== null && (
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="label">Match score</span>
                <strong>{String(matchScore)}</strong>
              </div>
            )}

            {imageUrl && (
              <Card>
                <span className="label">Última imagem enviada</span>
                <a href={imageUrl} target="_blank" rel="noreferrer" className="muted">
                  {imagem?.nome_original || "Abrir imagem"}
                </a>
                <img
                  src={imageUrl}
                  alt="Imagem enviada pelo cliente"
                  style={{ borderRadius: "12px", border: "1px solid var(--border)" }}
                />
              </Card>
            )}

            <div className="row" style={{ flexWrap: "wrap" }}>
              <Button onClick={() => setModal("aprovar")}>Aprovar</Button>
              <Button variant="danger" onClick={() => setModal("recusar")}>
                Recusar
              </Button>
              {detail.cliente_id && (
                <>
                  <Button variant="ghost" onClick={handleAssumir}>
                    Assumir conversa
                  </Button>
                  <Button variant="ghost" onClick={() => setModal("manual")}>
                    Interferir / Fechar manual
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal title="Aprovar orçamento" open={modal === "aprovar"} onClose={() => setModal(null)}>
        <label className="col">
          <span className="label">Data agendada (YYYY-MM-DD)</span>
          <input
            type="date"
            className="input"
            value={dataAgendada}
            onChange={(event) => setDataAgendada(event.target.value)}
          />
        </label>
        <label className="col">
          <span className="label">Observação</span>
          <textarea
            className="textarea"
            rows={3}
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
          />
        </label>
        <Button onClick={handleAprovar}>Confirmar aprovação</Button>
      </Modal>

      <Modal title="Recusar orçamento" open={modal === "recusar"} onClose={() => setModal(null)}>
        <label className="col">
          <span className="label">Motivo</span>
          <input
            className="input"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Motivo da recusa"
          />
        </label>
        <Button variant="danger" onClick={handleRecusar}>
          Confirmar recusa
        </Button>
      </Modal>

      <Modal title="Controle manual" open={modal === "manual"} onClose={() => setModal(null)}>
        <div className="col" style={{ gap: "16px" }}>
          <div className="card" style={{ padding: "16px" }}>
            <h4 style={{ marginTop: 0 }}>Interferir / Assumir conversa</h4>
            <label className="col">
              <span className="label">Duração (minutos)</span>
              <input
                type="number"
                className="input"
                min={30}
                value={manualMinutes}
                onChange={(event) => setManualMinutes(Number(event.target.value))}
              />
            </label>
            <label className="col">
              <span className="label">Motivo (opcional)</span>
              <input
                className="input"
                value={manualMotivo}
                onChange={(event) => setManualMotivo(event.target.value)}
              />
            </label>
            <div className="row">
              <Button variant="ghost" onClick={handleAssumir}>
                Assumir conversa
              </Button>
              <Button variant="ghost" onClick={handleInterferir}>
                Interferir
              </Button>
            </div>
          </div>

          <div className="card" style={{ padding: "16px" }}>
            <h4 style={{ marginTop: 0 }}>Fechar manualmente</h4>
            <label className="col">
              <span className="label">Valor final</span>
              <input
                type="number"
                className="input"
                value={manualValorFinal}
                onChange={(event) => setManualValorFinal(event.target.value)}
              />
            </label>
            <label className="col">
              <span className="label">Data agendada</span>
              <input
                type="date"
                className="input"
                value={manualData}
                onChange={(event) => setManualData(event.target.value)}
              />
            </label>
            <label className="col">
              <span className="label">Observação</span>
              <textarea
                className="textarea"
                rows={3}
                value={manualObs}
                onChange={(event) => setManualObs(event.target.value)}
              />
            </label>
            <Button variant="danger" onClick={handleFecharManual}>
              Fechar manual
            </Button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
    </div>
  );
};

export default OrcamentosPage;
