import { useCallback, useEffect, useMemo, useState } from "react";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Card from "../components/Card";
import Toast from "../components/Toast";
import { apiFetch } from "../lib/api";
import { formatDate, formatPeriod } from "../lib/format";

type Slot = {
  data: string;
  periodo: "MANHA" | "TARDE";
  capacidade: number;
  reservados: number;
  bloqueado: boolean;
};

const formatISO = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const AgendaPage = () => {
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => formatISO(today));
  const [to, setTo] = useState(() => {
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 14);
    return formatISO(endDate);
  });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant?: "success" | "error" } | null>(
    null
  );

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch<{ slots: Slot[] }>(`/owner/agenda?from=${from}&to=${to}`);
      setSlots(response.slots ?? []);
    } catch (error) {
      setToast({ message: (error as Error).message, variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const groupedSlots = useMemo(() => {
    return slots.reduce<Record<string, Slot[]>>((acc, slot) => {
      if (!acc[slot.data]) {
        acc[slot.data] = [];
      }
      acc[slot.data].push(slot);
      return acc;
    }, {});
  }, [slots]);

  const handleGerar = async () => {
    setActionLoading(true);
    try {
      await apiFetch("/owner/agenda/gerar", {
        method: "POST",
        body: { dias: 14 },
      });
      setToast({ message: "Agenda gerada com sucesso." });
      await fetchSlots();
    } catch (error) {
      setToast({ message: (error as Error).message, variant: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleBloqueio = async (slot: Slot) => {
    setActionLoading(true);
    try {
      const response = await apiFetch<{ slot: Slot }>("/owner/agenda/bloquear", {
        method: "POST",
        body: { data: slot.data, periodo: slot.periodo, bloqueado: !slot.bloqueado },
      });
      if (response.slot) {
        setSlots((prev) =>
          prev.map((item) =>
            item.data === response.slot.data && item.periodo === response.slot.periodo
              ? response.slot
              : item
          )
        );
      }
      setToast({
        message: slot.bloqueado ? "Slot desbloqueado." : "Slot bloqueado.",
      });
    } catch (error) {
      setToast({ message: (error as Error).message, variant: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="col" style={{ gap: "20px" }}>
      <Card>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="col">
            <h2 style={{ margin: 0 }}>Agenda</h2>
            <p className="muted">Gestão de capacidade por período.</p>
          </div>
          <div className="row">
            <Button variant="ghost" onClick={fetchSlots} disabled={loading}>
              Atualizar
            </Button>
            <Button onClick={handleGerar} disabled={actionLoading}>
              {actionLoading ? "Processando..." : "Gerar agenda"}
            </Button>
          </div>
        </div>
        <div className="row" style={{ marginTop: "16px", alignItems: "flex-end" }}>
          <label className="col" style={{ flex: 1 }}>
            <span className="label">De</span>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="col" style={{ flex: 1 }}>
            <span className="label">Até</span>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <Button variant="ghost" onClick={fetchSlots}>
            Buscar
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card>
          <div className="col">
            <div className="skeleton" style={{ height: "18px", width: "40%" }} />
            <div className="skeleton" style={{ height: "120px" }} />
          </div>
        </Card>
      ) : slots.length === 0 ? (
        <Card>
          <p className="muted">Nenhum slot encontrado. Gere a agenda para começar.</p>
        </Card>
      ) : (
        <div className="col" style={{ gap: "20px" }}>
          {Object.entries(groupedSlots).map(([date, daySlots]) => (
            <Card key={date}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 style={{ margin: 0 }}>{formatDate(date)}</h3>
                <Badge label={`${daySlots.length} períodos`} variant="info" />
              </div>
              <div className="grid" style={{ marginTop: "16px" }}>
                {daySlots.map((slot) => {
                  const cheio = slot.reservados >= slot.capacidade;

                  return (
                    <div
                      key={`${slot.data}-${slot.periodo}`}
                      className="card"
                      style={{ padding: "16px", background: "var(--surface-2)" }}
                    >
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <div className="col">
                          <strong>{formatPeriod(slot.periodo)}</strong>
                          <span className="muted">
                            Capacidade {slot.capacidade} · Reservados {slot.reservados}
                          </span>
                        </div>
                        {slot.bloqueado ? (
                          <Badge label="Bloqueado" variant="recusado" />
                        ) : cheio ? (
                          <Badge label="Capacidade cheia" variant="warning" />
                        ) : (
                          <Badge label="Disponível" variant="aprovado" />
                        )}
                      </div>
                      <div className="row" style={{ marginTop: "12px" }}>
                        <Button
                          variant={slot.bloqueado ? "ghost" : "danger"}
                          onClick={() => handleToggleBloqueio(slot)}
                          disabled={actionLoading}
                        >
                          {slot.bloqueado ? "Desbloquear" : "Bloquear"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
    </div>
  );
};

export default AgendaPage;
