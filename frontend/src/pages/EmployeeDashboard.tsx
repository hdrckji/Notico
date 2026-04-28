import { useEffect, useState } from 'react';
import client from '../services/api';
import { useAuthStore } from '../store/authStore';

type AppointmentStatus = 'SCHEDULED' | 'DELIVERED' | 'RESCHEDULED' | 'NO_SHOW' | 'CANCELLED';

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
  SCHEDULED: 'bg-blue-100 text-blue-800',
  DELIVERED: 'bg-green-100 text-green-800',
  RESCHEDULED: 'bg-yellow-100 text-yellow-800',
  NO_SHOW: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

export default function EmployeeDashboard() {
  const { logout, user } = useAuthStore();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterDate, setFilterDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
    try {
      await client.patch(`/appointments/${id}/status`, { status });
      setMessage(`Statut mis à jour : ${STATUS_LABELS[status]}`);
      await loadAppointments();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Mise à jour impossible.');
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = appointments.filter((a) => {
    const dateMatch = filterDate ? a.scheduledDate.slice(0, 10) === filterDate : true;
    const statusMatch = filterStatus === 'ALL' || a.status === filterStatus;
    return dateMatch && statusMatch;
  });

  const todayCount = appointments.filter((a) => a.scheduledDate.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
  const scheduledCount = appointments.filter((a) => a.status === 'SCHEDULED').length;
  const deliveredCount = appointments.filter((a) => a.status === 'DELIVERED').length;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-300 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Tableau de bord Logistique</h1>
            <p className="text-sm text-slate-500">Bienvenue {user?.firstName || 'Employé'} — gestion des livraisons</p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">

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

        {/* Messages */}
        {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        {/* Filtres */}
        <div className="flex flex-wrap gap-3 rounded-xl border border-slate-300 bg-white p-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Statut</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="ALL">Tous</option>
              {(Object.keys(STATUS_LABELS) as AppointmentStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={loadAppointments}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Rafraîchir
            </button>
          </div>
        </div>

        {/* Liste rendez-vous */}
        <div className="rounded-xl border border-slate-300 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Rendez-vous ({filtered.length})</h2>
          </div>

          {loading ? (
            <p className="p-6 text-slate-500">Chargement...</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-slate-500">Aucun rendez-vous pour ces critères.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((appt) => (
                <div key={appt.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{appt.supplier?.name || 'Fournisseur'}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_COLORS[appt.status]}`}>
                        {STATUS_LABELS[appt.status]}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">
                      Commande <span className="font-mono font-semibold">{appt.orderNumber}</span>
                      {' · '}{appt.volume} {appt.deliveryType === 'PALLET' ? 'palettes' : 'colis'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(appt.scheduledDate).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                      {appt.location && ` · ${appt.location.name}`}
                      {appt.quay && ` · Quai ${appt.quay.name}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {appt.status === 'SCHEDULED' && (
                      <>
                        <button
                          disabled={updatingId === appt.id}
                          onClick={() => updateStatus(appt.id, 'DELIVERED')}
                          className="rounded bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          ✓ Livré
                        </button>
                        <button
                          disabled={updatingId === appt.id}
                          onClick={() => updateStatus(appt.id, 'NO_SHOW')}
                          className="rounded bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          ✗ Absent
                        </button>
                      </>
                    )}
                    {(appt.status === 'RESCHEDULED') && (
                      <button
                        disabled={updatingId === appt.id}
                        onClick={() => updateStatus(appt.id, 'DELIVERED')}
                        className="rounded bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        ✓ Livré
                      </button>
                    )}
                    {appt.status === 'SCHEDULED' && (
                      <button
                        disabled={updatingId === appt.id}
                        onClick={() => updateStatus(appt.id, 'CANCELLED')}
                        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Annuler
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
