import { useEffect, useMemo, useState } from 'react';
import client from '../services/api';
import { useAuthStore } from '../store/authStore';

type AppointmentStatus = 'SCHEDULED' | 'DELIVERED' | 'RESCHEDULED' | 'NO_SHOW' | 'CANCELLED';
type ViewMode = 'week' | 'list' | 'history';

interface Appointment {
  id: string;
  orderNumber: string;
  volume: number;
  deliveryType: 'PALLET' | 'PARCEL';
  deliveryNoteNumber?: string | null;
  deliveryNoteFileName?: string | null;
  deliveryNoteFileMimeType?: string | null;
  deliveryNoteFileBase64?: string | null;
  palletsReceived?: number | null;
  palletsReturned?: number | null;
  scheduledDate: string;
  status: AppointmentStatus;
  createdByRole?: 'ADMIN' | 'EMPLOYEE' | 'SUPPLIER';
  statusHistory?: Array<{
    id: string;
    fromStatus: AppointmentStatus | null;
    toStatus: AppointmentStatus;
    changedByRole: 'ADMIN' | 'EMPLOYEE' | 'SUPPLIER';
    changedAt: string;
    changedByUser?: {
      firstName?: string;
      lastName?: string;
      email?: string;
    } | null;
  }>;
  supplier?: { name: string; phone: string };
  location?: { name: string };
  quay?: { name: string };
}

interface SupplierOption {
  id: string;
  name: string;
}

interface QuayOption {
  id: string;
  name: string;
}

interface LocationOption {
  id: string;
  name: string;
  quays: QuayOption[];
}

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Planifié',
  DELIVERED: 'Livré',
  RESCHEDULED: 'Reprogrammé',
  NO_SHOW: 'Absent',
  CANCELLED: 'Absent',
};

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800 border-blue-300',
  DELIVERED: 'bg-green-100 text-green-800 border-green-300',
  RESCHEDULED: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  NO_SHOW: 'bg-red-100 text-red-800 border-red-300',
  CANCELLED: 'bg-red-100 text-red-800 border-red-300',
};

const EMPLOYEE_CREATED_CLASSES = 'bg-amber-100 text-amber-900 border-amber-400';

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const formatAuditActor = (appt: Appointment, role: 'ADMIN' | 'EMPLOYEE' | 'SUPPLIER', changedByUser?: { firstName?: string; lastName?: string; email?: string } | null) => {
  if (changedByUser) {
    const fullName = [changedByUser.firstName, changedByUser.lastName].filter(Boolean).join(' ').trim();
    return fullName || changedByUser.email || role;
  }

  if (role === 'SUPPLIER') {
    return appt.supplier?.name || 'Fournisseur';
  }

  if (role === 'EMPLOYEE') {
    return 'Logistique';
  }

  return 'Admin';
};

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
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [view, setView] = useState<ViewMode>('week');
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [deliveryValidation, setDeliveryValidation] = useState({
    deliveryNoteNumber: '',
    palletsReceived: 0,
    palletsReturned: 0,
  });
  const [createForm, setCreateForm] = useState({
    supplierId: '',
    orderNumber: '',
    volume: 1,
    deliveryType: 'PALLET' as 'PALLET' | 'PARCEL',
    locationId: user?.locationId || '',
    quayId: '',
    scheduledDate: new Date().toISOString().slice(0, 16),
    deliveryNoteNumber: '',
    palletsReceived: 0,
    palletsReturned: 0,
  });

  const visibleLocations = useMemo(() => {
    if (!user?.locationId) {
      return locations;
    }
    return locations.filter((location) => location.id === user.locationId);
  }, [locations, user?.locationId]);

  const availableQuays = useMemo(() => {
    const location = visibleLocations.find((item) => item.id === createForm.locationId);
    return location?.quays || [];
  }, [visibleLocations, createForm.locationId]);

  const loadDashboardData = async (sinceAll = false) => {
    setLoading(true);
    setError('');
    try {
      const since = sinceAll ? '?since=all' : '';
      const [appointmentsResponse, suppliersResponse, locationsResponse] = await Promise.all([
        client.get(`/appointments${since}`),
        client.get('/suppliers'),
        client.get('/locations'),
      ]);
      setAppointments(appointmentsResponse.data || []);
      setSuppliers((suppliersResponse.data || []).map((supplier: any) => ({ id: supplier.id, name: supplier.name })));
      setLocations((locationsResponse.data || []).map((location: any) => ({
        id: location.id,
        name: location.name,
        quays: (location.quays || []).map((quay: any) => ({ id: quay.id, name: quay.name })),
      })));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Impossible de charger les rendez-vous.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const updateStatus = async (
    id: string,
    status: AppointmentStatus,
    details?: { deliveryNoteNumber: string; palletsReceived: number; palletsReturned: number }
  ) => {
    setUpdatingId(id);
    setMessage('');
    setError('');
    try {
      await client.patch(`/appointments/${id}/status`, {
        status,
        ...(details || {}),
      });
      setMessage(`Statut mis à jour : ${STATUS_LABELS[status]}`);
      setSelectedAppt(null);
      await loadDashboardData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Mise à jour impossible.');
    } finally {
      setUpdatingId(null);
    }
  };

  const openDeliveredValidation = async (appt: Appointment) => {
    // Pre-fill from list data immediately so modal opens fast
    setDeliveryValidation({
      deliveryNoteNumber: appt.deliveryNoteNumber || '',
      palletsReceived: appt.palletsReceived ?? 0,
      palletsReturned: appt.palletsReturned ?? 0,
    });
    setSelectedAppt(appt);
    // Then fetch full detail (status history + BL file) in background
    setLoadingDetail(true);
    try {
      const res = await client.get(`/appointments/${appt.id}`);
      setSelectedAppt(res.data);
      setDeliveryValidation({
        deliveryNoteNumber: res.data.deliveryNoteNumber || '',
        palletsReceived: res.data.palletsReceived ?? 0,
        palletsReturned: res.data.palletsReturned ?? 0,
      });
    } catch {
      // keep light data already shown
    } finally {
      setLoadingDetail(false);
    }
  };

  const submitDeliveredValidation = async () => {
    if (!selectedAppt) return;
    await updateStatus(selectedAppt.id, 'DELIVERED', {
      deliveryNoteNumber: deliveryValidation.deliveryNoteNumber.trim(),
      palletsReceived: Math.max(0, Number(deliveryValidation.palletsReceived) || 0),
      palletsReturned: Math.max(0, Number(deliveryValidation.palletsReturned) || 0),
    });
  };

  useEffect(() => {
    if (!createForm.locationId && visibleLocations.length === 1) {
      setCreateForm((prev) => ({ ...prev, locationId: visibleLocations[0].id }));
    }
  }, [visibleLocations, createForm.locationId]);

  useEffect(() => {
    if (availableQuays.length === 1 && createForm.quayId !== availableQuays[0].id) {
      setCreateForm((prev) => ({ ...prev, quayId: availableQuays[0].id }));
      return;
    }

    if (createForm.quayId && !availableQuays.some((quay) => quay.id === createForm.quayId)) {
      setCreateForm((prev) => ({ ...prev, quayId: '' }));
    }
  }, [availableQuays, createForm.quayId]);

  const handleCreateAppointment = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError('');
    setMessage('');

    try {
      await client.post('/appointments', {
        supplierId: createForm.supplierId,
        orderNumber: createForm.orderNumber.trim(),
        volume: createForm.volume,
        deliveryType: createForm.deliveryType,
        locationId: createForm.locationId,
        quayId: createForm.quayId,
        scheduledDate: new Date(createForm.scheduledDate).toISOString(),
        status: 'DELIVERED',
        deliveryNoteNumber: createForm.deliveryNoteNumber.trim() || null,
        palletsReceived: Math.max(0, Number(createForm.palletsReceived) || 0),
        palletsReturned: Math.max(0, Number(createForm.palletsReturned) || 0),
      });

      setMessage('Livraison non planifiee ajoutee avec succes.');
      setCreateForm({
        supplierId: '',
        orderNumber: '',
        volume: 1,
        deliveryType: 'PALLET',
        locationId: user?.locationId || visibleLocations[0]?.id || '',
        quayId: '',
        scheduledDate: new Date().toISOString().slice(0, 16),
        deliveryNoteNumber: '',
        palletsReceived: 0,
        palletsReturned: 0,
      });
      await loadDashboardData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Creation de la livraison impossible.');
    } finally {
      setCreating(false);
    }
  };

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const visibleAppointments = useMemo(() => appointments, [appointments]);

  const apptsByDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    weekDays.forEach((d) => { map[toLocalISO(d)] = []; });
    visibleAppointments.forEach((a) => {
      const key = new Date(a.scheduledDate).toLocaleDateString('fr-CA');
      if (map[key]) map[key].push(a);
    });
    return map;
  }, [visibleAppointments, weekDays]);

  const todayISO = toLocalISO(new Date());
  const todayCount = appointments.filter((a) => new Date(a.scheduledDate).toLocaleDateString('fr-CA') === todayISO).length;
  const scheduledCount = appointments.filter((a) => a.status === 'SCHEDULED').length;
  const deliveredCount = appointments.filter((a) => a.status === 'DELIVERED').length;

  const listFiltered = visibleAppointments.filter((a) => filterStatus === 'ALL' || a.status === filterStatus);
  const historyFiltered = [...visibleAppointments]
    .filter((a) => filterStatus === 'ALL' || a.status === filterStatus)
    .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());

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

        <section className="rounded-xl border border-slate-300 bg-white p-4 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Ajouter une livraison non planifiee</h2>
            <p className="text-sm text-slate-500">Enregistrez manuellement un arrivage exceptionnel depuis l espace logistique.</p>
          </div>

          <form onSubmit={handleCreateAppointment} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <select
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              value={createForm.supplierId}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, supplierId: e.target.value }))}
              required
            >
              <option value="">Selectionner un fournisseur</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>

            <input
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Numero de commande"
              value={createForm.orderNumber}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, orderNumber: e.target.value }))}
              required
            />

            <input
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              type="number"
              min={1}
              value={createForm.volume}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, volume: Math.max(1, Number(e.target.value) || 1) }))}
              required
            />

            <select
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              value={createForm.deliveryType}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, deliveryType: e.target.value as 'PALLET' | 'PARCEL' }))}
            >
              <option value="PALLET">Palettes</option>
              <option value="PARCEL">Colis</option>
            </select>

            <select
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              value={createForm.locationId}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, locationId: e.target.value, quayId: '' }))}
              required
              disabled={Boolean(user?.locationId)}
            >
              <option value="">Selectionner un site</option>
              {visibleLocations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>

            <select
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              value={createForm.quayId}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, quayId: e.target.value }))}
              required
            >
              <option value="">Selectionner un quai</option>
              {availableQuays.map((quay) => (
                <option key={quay.id} value={quay.id}>{quay.name}</option>
              ))}
            </select>

            <input
              className="rounded border border-slate-300 px-3 py-2 text-sm xl:col-span-2"
              type="datetime-local"
              value={createForm.scheduledDate}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, scheduledDate: e.target.value }))}
              required
            />

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Numéro de bon de livraison (optionnel)</label>
              <input
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="Ex: BL-2026-00123"
                value={createForm.deliveryNoteNumber}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, deliveryNoteNumber: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Palettes reçues (entrantes)</label>
              <input
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                type="number"
                min={0}
                placeholder="0"
                value={createForm.palletsReceived}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, palletsReceived: Math.max(0, Number(e.target.value) || 0) }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Palettes rendues (sortantes)</label>
              <input
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                type="number"
                min={0}
                placeholder="0"
                value={createForm.palletsReturned}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, palletsReturned: Math.max(0, Number(e.target.value) || 0) }))}
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {creating ? 'Creation...' : 'Ajouter la livraison'}
            </button>
          </form>
        </section>

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
            <button onClick={() => { setView('week'); loadDashboardData(false); }} className={`px-4 py-1.5 ${view === 'week' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Semaine</button>
            <button onClick={() => { setView('list'); loadDashboardData(false); }} className={`px-4 py-1.5 ${view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Liste</button>
            <button onClick={() => { setView('history'); loadDashboardData(true); }} className={`px-4 py-1.5 ${view === 'history' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Historique</button>
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

          {(view === 'list' || view === 'history') && (
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded border border-slate-300 px-3 py-1.5 text-sm">
              <option value="ALL">Tous les statuts</option>
              {(['SCHEDULED', 'DELIVERED', 'RESCHEDULED', 'NO_SHOW'] as AppointmentStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          )}

          <button onClick={() => loadDashboardData(view === 'history')} className="ml-auto rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
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
                        <p className="text-xs font-bold uppercase" translate="no">{DAYS_FR[i]}</p>
                        <p className={`text-lg font-black ${isToday ? 'text-white' : 'text-slate-900'}`}>{day.getDate()}</p>
                      </div>
                      <div className="p-1 space-y-1">
                        {dayAppts.length === 0 && <p className="text-xs text-slate-300 text-center pt-2">—</p>}
                        {dayAppts.map((appt) => (
                          <button
                            key={appt.id}
                            onClick={() => openDeliveredValidation(appt)}
                            className={`w-full rounded border text-left px-1.5 py-1 text-xs leading-tight hover:opacity-80 transition ${
                              appt.createdByRole === 'EMPLOYEE' ? EMPLOYEE_CREATED_CLASSES : STATUS_COLORS[appt.status]
                            }`}
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
                  <AppointmentRow
                    key={appt.id}
                    appt={appt}
                    updatingId={updatingId}
                    onUpdate={updateStatus}
                    onOpenDelivered={openDeliveredValidation}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Vue Historique illimitée */}
        {view === 'history' && (
          <div className="rounded-xl border border-slate-300 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-bold text-slate-900">Historique complet ({historyFiltered.length})</h2>
              <p className="text-xs text-slate-500">Aucune limitation de période: toutes les livraisons passées restent visibles.</p>
            </div>
            {loading ? (
              <p className="p-6 text-slate-500">Chargement...</p>
            ) : historyFiltered.length === 0 ? (
              <p className="p-6 text-slate-500">Aucun rendez-vous dans l'historique.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {historyFiltered.map((appt) => (
                  <button
                    key={appt.id}
                    type="button"
                    onClick={() => openDeliveredValidation(appt)}
                    className="w-full px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{appt.supplier?.name || 'Fournisseur'}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold border ${appt.createdByRole === 'EMPLOYEE' ? EMPLOYEE_CREATED_CLASSES : STATUS_COLORS[appt.status]}`}>{STATUS_LABELS[appt.status]}</span>
                    </div>
                    <p className="text-sm text-slate-600">Commande {appt.orderNumber} · {appt.volume} {appt.deliveryType === 'PALLET' ? 'palettes' : 'colis'}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(appt.scheduledDate).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                      {appt.location && ` · ${appt.location.name}`}
                      {appt.quay && ` · Quai ${appt.quay.name}`}
                    </p>
                  </button>
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
              {selectedAppt.deliveryNoteNumber && <p><span className="font-semibold">BL :</span> {selectedAppt.deliveryNoteNumber}</p>}
              {selectedAppt.deliveryNoteFileBase64 && selectedAppt.deliveryNoteFileName && (
                <p>
                  <span className="font-semibold">Fichier BL (fournisseur) :</span>{' '}
                  <a
                    href={`data:${selectedAppt.deliveryNoteFileMimeType || 'application/octet-stream'};base64,${selectedAppt.deliveryNoteFileBase64}`}
                    download={selectedAppt.deliveryNoteFileName}
                    className="text-blue-700 underline hover:text-blue-900"
                  >
                    {selectedAppt.deliveryNoteFileName}
                  </a>
                </p>
              )}
              {(selectedAppt.palletsReceived !== undefined && selectedAppt.palletsReceived !== null) && (
                <p><span className="font-semibold">Palettes reçues :</span> {selectedAppt.palletsReceived}</p>
              )}
              {(selectedAppt.palletsReturned !== undefined && selectedAppt.palletsReturned !== null) && (
                <p><span className="font-semibold">Palettes rendues :</span> {selectedAppt.palletsReturned}</p>
              )}
              {selectedAppt.createdByRole === 'EMPLOYEE' && (
                <p>
                  <span className="font-semibold">Origine :</span>{' '}
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold border bg-amber-100 text-amber-900 border-amber-400">Encodé par la logistique</span>
                </p>
              )}
              {selectedAppt.statusHistory && selectedAppt.statusHistory.length > 0 && (
                <div className="pt-2">
                  <p className="font-semibold mb-1">Historique des statuts :</p>
                  <div className="space-y-1 rounded border border-slate-200 bg-slate-50 p-2">
                    {selectedAppt.statusHistory.slice(0, 5).map((entry) => (
                      <p key={entry.id} className="text-xs text-slate-600">
                        {new Date(entry.changedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                        {' · '}
                        {entry.fromStatus ? `${STATUS_LABELS[entry.fromStatus]} -> ` : ''}{STATUS_LABELS[entry.toStatus]}
                        {' · par '}
                        {formatAuditActor(selectedAppt, entry.changedByRole, entry.changedByUser)}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {loadingDetail && !selectedAppt.statusHistory && (
                <p className="text-xs text-slate-400">Chargement de l'historique...</p>
              )}
              <p>
                <span className="font-semibold">Statut :</span>{' '}
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold border ${STATUS_COLORS[selectedAppt.status]}`}>{STATUS_LABELS[selectedAppt.status]}</span>
              </p>
            </div>
            {(selectedAppt.status === 'SCHEDULED' || selectedAppt.status === 'RESCHEDULED') && (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Validation livraison</p>
                  <input
                    className="mb-2 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Numero de bon de livraison (BL)"
                    value={deliveryValidation.deliveryNoteNumber}
                    onChange={(e) => setDeliveryValidation((prev) => ({ ...prev, deliveryNoteNumber: e.target.value }))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Palettes reçues</label>
                      <input
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        type="number"
                        min={0}
                        value={deliveryValidation.palletsReceived}
                        onChange={(e) => setDeliveryValidation((prev) => ({ ...prev, palletsReceived: Math.max(0, Number(e.target.value) || 0) }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-500">Palettes rendues</label>
                      <input
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        type="number"
                        min={0}
                        value={deliveryValidation.palletsReturned}
                        onChange={(e) => setDeliveryValidation((prev) => ({ ...prev, palletsReturned: Math.max(0, Number(e.target.value) || 0) }))}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Solde de cet arrivage: {deliveryValidation.palletsReceived - deliveryValidation.palletsReturned > 0
                      ? `vous devez ${deliveryValidation.palletsReceived - deliveryValidation.palletsReturned} palette(s) au fournisseur`
                      : deliveryValidation.palletsReceived - deliveryValidation.palletsReturned < 0
                        ? `vous avez rendu ${Math.abs(deliveryValidation.palletsReceived - deliveryValidation.palletsReturned)} palette(s) de plus`
                        : 'équilibré'}
                  </p>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button disabled={updatingId === selectedAppt.id} onClick={submitDeliveredValidation} className="flex-1 rounded bg-green-600 px-3 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50">✓ Livré</button>
                </div>
                {selectedAppt.status === 'SCHEDULED' && (
                  <>
                    <button disabled={updatingId === selectedAppt.id} onClick={() => updateStatus(selectedAppt.id, 'NO_SHOW')} className="flex-1 rounded bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">✗ Absent</button>
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

function AppointmentRow({
  appt,
  updatingId,
  onUpdate,
  onOpenDelivered,
}: {
  appt: Appointment;
  updatingId: string | null;
  onUpdate: (id: string, status: AppointmentStatus) => void;
  onOpenDelivered: (appt: Appointment) => void;
}) {
  return (
    <div className={`flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between ${appt.createdByRole === 'EMPLOYEE' ? 'bg-amber-50' : ''}`}>
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">{appt.supplier?.name || 'Fournisseur'}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold border ${appt.createdByRole === 'EMPLOYEE' ? EMPLOYEE_CREATED_CLASSES : STATUS_COLORS[appt.status]}`}>{STATUS_LABELS[appt.status]}</span>
          {appt.createdByRole === 'EMPLOYEE' && (
            <span className="rounded-full px-2 py-0.5 text-xs font-bold border bg-amber-100 text-amber-900 border-amber-400">Non planifiée</span>
          )}
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
          <button disabled={updatingId === appt.id} onClick={() => onOpenDelivered(appt)} className="rounded bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50">✓ Livré</button>
        )}
        {appt.status === 'SCHEDULED' && (
          <>
            <button disabled={updatingId === appt.id} onClick={() => onUpdate(appt.id, 'NO_SHOW')} className="rounded bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">✗ Absent</button>
          </>
        )}
      </div>
    </div>
  );
}
