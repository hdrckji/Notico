import { useEffect, useMemo, useState } from 'react';
import client from '../services/api';
import { useAuthStore } from '../store/authStore';

type AppointmentStatus = 'SCHEDULED' | 'DELIVERED' | 'RESCHEDULED' | 'NO_SHOW' | 'CANCELLED';
type ViewMode = 'week' | 'list';

interface Appointment {
  id: string;
  orderNumber: string;
  volume: number;
  deliveryType: 'PALLET' | 'PARCEL';
  scheduledDate: string;
  status: AppointmentStatus;
  supplier?: { name: string; phone: string };
  location?: { name: string };
  quay?: { name: string };
}

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Planifié',
  DELIVERED: 'Livré',
  RESCHEDULED: 'Reprogrammé',
  NO_SHOW: 'Absent',
  CANCELLED: 'Annulé',
};

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800 border-blue-300',
  DELIVERED: 'bg-green-100 text-green-800 border-green-300',
  RESCHEDULED: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  NO_SHOW: 'bg-red-100 text-red-800 border-red-300',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
};

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toLocalISO(date: Date): string {
  return date.toLocaleDateString('fr-CA'); // YYYY-MM-DD locale-safe
}

export default function EmployeeDashboard() {
  const { logout, user } = useAuthStore();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [view, setView] = useState<ViewMode>('week');
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);

  const loadAppointments = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/appointments');
      setAppointments(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Impossible de charger les rendez-vous.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppointments();
  }, []);

  const updateStatus = async (id: string, status: AppointmentStatus) => {
    setUpdatingId(id);
    setMessage('');
    setError('');
    try {
      await client.patch(`/appointments/${id}/status`, { status });
      setMessage(`Statut mis à jour : ${STATUS_LABELS[status]}`);
      setSelectedAppt(null);
      await loadAppointments();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Mise à jour impossible.');
    } finally {
      setUpdatingId(null);
    }
  };

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const apptsByDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    weekDays.forEach((d) => { map[toLocalISO(d)] = []; });
    appointments.forEach((a) => {
      const key = new Date(a.scheduledDate).toLocaleDateString('fr-CA');
      if (map[key]) map[key].push(a);
    });
    return map;
  }, [appointments, weekDays]);

  const todayISO = toLocalISO(new Date());
  const todayCount = appointments.filter((a) => new Date(a.scheduledDate).toLocaleDateString('fr-CA') === todayISO).length;
  const scheduledCount = appointments.filter((a) => a.status === 'SCHEDULED').length;
  const deliveredCount = appointments.filter((a) => a.status === 'DELIVERED').length;

  const listFiltered = appointments.filter((a) => filterStatus === 'ALL' || a.status === filterStatus);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-300 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Tableau de bord Logistique</h1>
            <p className="text-sm text-slate-500">Bienvenue {user?.firstName || 'Employé'}</p>
          </div>
          <button onClick={logout} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Déconnexion
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 space-y-4">

        {/* Stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-blue-600 p-4 text-white">
            <p className="text-xs uppercase tracking-wide text-blue-200">Aujourd'hui</p>
            <p className="mt-1 text-3xl font-black">{todayCount}</p>
          </div>
          <div className="rounded-xl bg-orange-500 p-4 text-white">
            <p className="text-xs uppercase tracking-wide text-orange-200">En attente</p>
            <p className="mt-1 text-3xl font-black">{scheduledCount}</p>
          </div>
          <div className="rounded-xl bg-green-600 p-4 text-white">
            <p className="text-xs uppercase tracking-wide text-green-200">Livrés</p>
            <p className="mt-1 text-3xl font-black">{deliveredCount}</p>
          </div>
        </div>

        {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-300 bg-white p-3">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm font-semibold">
            <button onClick={() => setView('week')} className={`px-4 py-1.5 ${view === 'week' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Semaine</button>
            <button onClick={() => setView('list')} className={`px-4 py-1.5 ${view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Liste</button>
          </div>

          {view === 'week' && (
            <div className="flex items-center gap-2">
              <button onClick={() => setWeekStart((w) => addDays(w, -7))} className="rounded border px-2 py-1 text-sm hover:bg-slate-100">◀</button>
              <span className="text-sm font-semibold text-slate-700">
                {weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – {addDays(weekStart, 6).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <button onClick={() => setWeekStart((w) => addDays(w, 7))} className="rounded border px-2 py-1 text-sm hover:bg-slate-100">▶</button>
              <button onClick={() => setWeekStart(getWeekStart(new Date()))} className="rounded border px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">Aujourd'hui</button>
            </div>
          )}

          {view === 'list' && (
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded border border-slate-300 px-3 py-1.5 text-sm">
              <option value="ALL">Tous les statuts</option>
              {(Object.keys(STATUS_LABELS) as AppointmentStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          )}

          <button onClick={loadAppointments} className="ml-auto rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            ↻ Rafraîchir
          </button>
        </div>

        {/* Vue Semaine */}
        {view === 'week' && (
          <div className="rounded-xl border border-slate-300 bg-white overflow-hidden">
            {loading ? (
              <p className="p-6 text-slate-500">Chargement...</p>
            ) : (
              <div className="grid grid-cols-7 divide-x divide-slate-200">
                {weekDays.map((day, i) => {
                  const iso = toLocalISO(day);
                  const isToday = iso === todayISO;
                  const dayAppts = apptsByDay[iso] || [];
                  return (
                    <div key={iso} className="min-h-32">
                      <div className={`px-2 py-2 text-center border-b border-slate-200 ${isToday ? 'bg-blue-600 text-white' : 'bg-slate-50'}`}>
                        <p className="text-xs font-bold uppercase">{DAYS_FR[i]}</p>
                        <p className={`text-lg font-black ${isToday ? 'text-white' : 'text-slate-900'}`}>{day.getDate()}</p>
                      </div>
                      <div className="p-1 space-y-1">
                        {dayAppts.length === 0 && <p className="text-xs text-slate-300 text-center pt-2">—</p>}
                        {dayAppts.map((appt) => (
                          <button
                            key={appt.id}
                            onClick={() => setSelectedAppt(appt)}
                            className={`w-full rounded border text-left px-1.5 py-1 text-xs leading-tight hover:opacity-80 transition ${STATUS_COLORS[appt.status]}`}
                          >
                            <p className="font-bold truncate">{appt.supplier?.name || '—'}</p>
                            <p className="truncate opacity-75">{appt.orderNumber}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Vue Liste */}
        {view === 'list' && (
          <div className="rounded-xl border border-slate-300 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-bold text-slate-900">Rendez-vous ({listFiltered.length})</h2>
            </div>
            {loading ? (
              <p className="p-6 text-slate-500">Chargement...</p>
            ) : listFiltered.length === 0 ? (
              <p className="p-6 text-slate-500">Aucun rendez-vous.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {listFiltered.map((appt) => (
                  <AppointmentRow key={appt.id} appt={appt} updatingId={updatingId} onUpdate={updateStatus} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal détail rendez-vous */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedAppt(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-900">{selectedAppt.supplier?.name || 'Fournisseur'}</h3>
              <button onClick={() => setSelectedAppt(null)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">×</button>
            </div>
            <div className="space-y-1 text-sm text-slate-700 mb-4">
              <p><span className="font-semibold">Commande :</span> {selectedAppt.orderNumber}</p>
              <p><span className="font-semibold">Volume :</span> {selectedAppt.volume} {selectedAppt.deliveryType === 'PALLET' ? 'palettes' : 'colis'}</p>
              <p><span className="font-semibold">Date :</span> {new Date(selectedAppt.scheduledDate).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}</p>
              {selectedAppt.location && <p><span className="font-semibold">Site :</span> {selectedAppt.location.name}</p>}
              {selectedAppt.quay && <p><span className="font-semibold">Quai :</span> {selectedAppt.quay.name}</p>}
              <p>
                <span className="font-semibold">Statut :</span>{' '}
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold border ${STATUS_COLORS[selectedAppt.status]}`}>{STATUS_LABELS[selectedAppt.status]}</span>
              </p>
            </div>
            {(selectedAppt.status === 'SCHEDULED' || selectedAppt.status === 'RESCHEDULED') && (
              <div className="flex gap-2 flex-wrap">
                <button disabled={updatingId === selectedAppt.id} onClick={() => updateStatus(selectedAppt.id, 'DELIVERED')} className="flex-1 rounded bg-green-600 px-3 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50">✓ Livré</button>
                {selectedAppt.status === 'SCHEDULED' && (
                  <>
                    <button disabled={updatingId === selectedAppt.id} onClick={() => updateStatus(selectedAppt.id, 'NO_SHOW')} className="flex-1 rounded bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">✗ Absent</button>
                    <button disabled={updatingId === selectedAppt.id} onClick={() => updateStatus(selectedAppt.id, 'CANCELLED')} className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Annuler</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AppointmentRow({ appt, updatingId, onUpdate }: { appt: Appointment; updatingId: string | null; onUpdate: (id: string, status: AppointmentStatus) => void }) {
  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">{appt.supplier?.name || 'Fournisseur'}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold border ${STATUS_COLORS[appt.status]}`}>{STATUS_LABELS[appt.status]}</span>
        </div>
        <p className="text-sm text-slate-600">Commande <span className="font-mono font-semibold">{appt.orderNumber}</span> · {appt.volume} {appt.deliveryType === 'PALLET' ? 'palettes' : 'colis'}</p>
        <p className="text-xs text-slate-400">
          {new Date(appt.scheduledDate).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
          {appt.location && ` · ${appt.location.name}`}
          {appt.quay && ` · Quai ${appt.quay.name}`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(appt.status === 'SCHEDULED' || appt.status === 'RESCHEDULED') && (
          <button disabled={updatingId === appt.id} onClick={() => onUpdate(appt.id, 'DELIVERED')} className="rounded bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50">✓ Livré</button>
        )}
        {appt.status === 'SCHEDULED' && (
          <>
            <button disabled={updatingId === appt.id} onClick={() => onUpdate(appt.id, 'NO_SHOW')} className="rounded bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">✗ Absent</button>
            <button disabled={updatingId === appt.id} onClick={() => onUpdate(appt.id, 'CANCELLED')} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Annuler</button>
          </>
        )}
      </div>
    </div>
  );
}
}
