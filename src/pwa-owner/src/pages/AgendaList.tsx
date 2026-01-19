import { useCallback, useEffect, useMemo, useState } from "react";
import apiClient from "../api/apiClient";
import Toast from "../components/Toast";

type Slot = {
  id?: number;
  data: string;
  periodo: "MANHA" | "TARDE";
  capacidade: number;
  reservados: number;
  bloqueado: boolean;
};

const formatISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const AgendaList = () => {
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() => formatISODate(today));
  const [to, setTo] = useState(() => {
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 30);
    return formatISODate(endDate);
  });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    variant?: "success" | "error";
  } | null>(null);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get("/owner/agenda", {
        params: { from, to },
      });
      setSlots(response.data?.slots ?? []);
    } catch (error) {
      setToast({ message: "Erro ao carregar a agenda.", variant: "error" });
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
      await apiClient.post("/owner/agenda/gerar", { dias: 30 });
      setToast({ message: "Agenda gerada com sucesso." });
      await fetchSlots();
    } catch (error) {
      setToast({ message: "Erro ao gerar agenda.", variant: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleBloqueio = async (slot: Slot) => {
    setActionLoading(true);
    try {
      const response = await apiClient.post("/owner/agenda/bloquear", {
        data: slot.data,
        periodo: slot.periodo,
        bloqueado: !slot.bloqueado,
      });
      const updatedSlot = response.data?.slot;
      if (updatedSlot) {
        setSlots((prev) =>
          prev.map((item) =>
            item.data === updatedSlot.data && item.periodo === updatedSlot.periodo
              ? { ...item, ...updatedSlot }
              : item
          )
        );
      }
      setToast({
        message: `Slot ${slot.periodo} ${slot.bloqueado ? "desbloqueado" : "bloqueado"}.`,
      });
    } catch (error) {
      setToast({ message: "Erro ao atualizar bloqueio.", variant: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Agenda</h2>
          <p className="muted">Disponibilidade por dia e período.</p>
        </div>
        <div className="agenda-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={fetchSlots}
            disabled={loading}
          >
            Atualizar
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleGerar}
            disabled={actionLoading}
          >
            {actionLoading ? "Processando..." : "Gerar 30 dias"}
          </button>
        </div>
      </div>

      <div className="agenda-filters">
        <label className="field">
          <span>De</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>Até</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="secondary-button" onClick={fetchSlots}>
          Buscar
        </button>
      </div>

      {loading ? (
        <p className="muted">Carregando agenda...</p>
      ) : slots.length === 0 ? (
        <p className="muted">Nenhum slot encontrado.</p>
      ) : (
        <div className="agenda-list">
          {Object.entries(groupedSlots).map(([date, daySlots]) => (
            <div key={date} className="agenda-day">
              <h3>{new Date(date).toLocaleDateString("pt-BR")}</h3>
              <div className="agenda-slots">
                {daySlots.map((slot) => (
                  <div key={`${slot.data}-${slot.periodo}`} className="agenda-slot">
                    <div>
                      <strong>{slot.periodo}</strong>
                      <p className="muted">
                        Capacidade: {slot.capacidade} · Reservados: {slot.reservados}
                      </p>
                      <p className="muted">
                        {slot.bloqueado ? "Bloqueado" : "Disponível"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={slot.bloqueado ? "secondary-button" : "danger-button"}
                      onClick={() => handleToggleBloqueio(slot)}
                      disabled={actionLoading}
                    >
                      {slot.bloqueado ? "Desbloquear" : "Bloquear"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
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

export default AgendaList;
