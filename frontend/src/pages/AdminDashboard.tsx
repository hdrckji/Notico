import { FormEvent, useEffect, useMemo, useState } from 'react';
import client from '../services/api';
import { useAuthStore } from '../store/authStore';

type AdminSection = 'overview' | 'suppliers' | 'users' | 'locations' | 'quays' | 'capacities' | 'assignments' | 'appointments' | 'reliability';
type AppointmentStatus = 'SCHEDULED' | 'DELIVERED' | 'RESCHEDULED' | 'NO_SHOW' | 'CANCELLED';

interface SupplierReliabilityRow {
  supplierId: string;
  supplierName: string;
  deliveredCount: number;
  deliveredOnPlannedDateCount: number;
  onTimeRate: number;
}

interface Appointment {
  id: string;
  orderNumber: string;
  volume: number;
  deliveryType: 'PALLET' | 'PARCEL';
  scheduledDate: string;
  status: AppointmentStatus;
  supplierId: string;
  locationId: string | null;
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
  supplier?: { name: string };
  location?: { name: string };
}

interface Supplier {
  id: string;
  name: string;
  email: string;
  isGold?: boolean;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  contact: string;
}

interface SupplierAssignment {
  id: string;
  quayId: string;
  quay: {
    id: string;
    name: string;
    location: { id: string; name: string };
  };
}

interface PalletBalanceRow {
  supplierId: string;
  supplierName: string;
  palletsReceived: number;
  palletsReturned: number;
  balance: number;
}

interface QuayCapacity {
  maxParcelsPerDay: number;
  maxPalletsPerDay: number;
}

interface InternalUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  locationId: string | null;
  assignedQuayIds: string[];
}

interface Quay {
  id: string;
  name: string;
  locationId: string;
  capacity?: QuayCapacity | null;
}

interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  postalCode: string;
  orderPrefix?: string | null;
  quays: Quay[];
}

const formatAppointmentAuditActor = (
  appt: Appointment,
  role: 'ADMIN' | 'EMPLOYEE' | 'SUPPLIER',
  changedByUser?: { firstName?: string; lastName?: string; email?: string } | null
) => {
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

const toDayKey = (value: string) => new Date(value).toLocaleDateString('fr-CA');

export default function AdminDashboard() {
  const { logout, user } = useAuthStore();
  const [activeSection, setActiveSection] = useState<AdminSection>('overview');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierAssignments, setSupplierAssignments] = useState<SupplierAssignment[]>([]);  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [palletBalances, setPalletBalances] = useState<PalletBalanceRow[]>([]);
  const [internalUsers, setInternalUsers] = useState<InternalUser[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [editingSupplier, setEditingSupplier] = useState<(Supplier & { password?: string }) | null>(null);
  const [editingUser, setEditingUser] = useState<(InternalUser & { password?: string }) | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [appointmentForm, setAppointmentForm] = useState({
    supplierId: '',
    orderNumber: '',
    volume: 1,
    deliveryType: 'PALLET' as 'PALLET' | 'PARCEL',
    scheduledDate: '',
    locationId: '',
    quayId: '',
    status: 'SCHEDULED' as AppointmentStatus,
  });

  const [supplierForm, setSupplierForm] = useState({
    name: '',
    email: '',
    password: '',
    isGold: false,
    phone: '',
    address: '',
    postalCode: '',
    city: '',
    contact: '',
  });
  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, QuayCapacity>>({});

  const [userForm, setUserForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'EMPLOYEE',
    locationId: '',
    quayIds: [] as string[],
  });

  const [locationForm, setLocationForm] = useState({
    name: '',
    address: '',
    city: '',
    postalCode: '',
    orderPrefix: '',
  });

  const [quayForm, setQuayForm] = useState({
    name: '',
    locationId: '',
  });

  const [assignmentForm, setAssignmentForm] = useState({
    supplierId: '',
    locationId: '',
    quayIds: [] as string[],
  });

  const allQuays = useMemo(
    () => locations.flatMap((location) => location.quays.map((quay) => ({ ...quay, locationName: location.name }))),
    [locations]
  );
  const assignmentQuays = useMemo(
    () => allQuays.filter((quay) => !assignmentForm.locationId || quay.locationId === assignmentForm.locationId),
    [allQuays, assignmentForm.locationId]
  );
  const appointmentQuays = useMemo(
    () => allQuays.filter((quay) => !appointmentForm.locationId || quay.locationId === appointmentForm.locationId),
    [allQuays, appointmentForm.locationId]
  );
  const supplierReliability = useMemo<SupplierReliabilityRow[]>(() => {
    const bySupplier = new Map<string, SupplierReliabilityRow>();

    appointments
      .filter((appt) => appt.status === 'DELIVERED')
      .forEach((appt) => {
        const supplierId = appt.supplierId;
        const supplierName = appt.supplier?.name || suppliers.find((s) => s.id === supplierId)?.name || 'Fournisseur';
        const row = bySupplier.get(supplierId) || {
          supplierId,
          supplierName,
          deliveredCount: 0,
          deliveredOnPlannedDateCount: 0,
          onTimeRate: 0,
        };

        row.deliveredCount += 1;

        const deliveredHistoryEntry = (appt.statusHistory || []).find((entry) => entry.toStatus === 'DELIVERED');
        if (deliveredHistoryEntry && toDayKey(deliveredHistoryEntry.changedAt) === toDayKey(appt.scheduledDate)) {
          row.deliveredOnPlannedDateCount += 1;
        }

        row.onTimeRate = row.deliveredCount > 0
          ? Math.round((row.deliveredOnPlannedDateCount / row.deliveredCount) * 100)
          : 0;

        bySupplier.set(supplierId, row);
      });

    return Array.from(bySupplier.values()).sort((a, b) => {
      if (b.onTimeRate !== a.onTimeRate) return b.onTimeRate - a.onTimeRate;
      return b.deliveredCount - a.deliveredCount;
    });
  }, [appointments, suppliers]);
  const selectedSupplierBalance = useMemo(
    () => (editingSupplier ? palletBalances.find((row) => row.supplierId === editingSupplier.id) : null),
    [editingSupplier, palletBalances]
  );
  const selectedSupplierReliability = useMemo(
    () => (editingSupplier ? supplierReliability.find((row) => row.supplierId === editingSupplier.id) : null),
    [editingSupplier, supplierReliability]
  );

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [suppliersResponse, locationsResponse, usersResponse, appointmentsResponse, balancesResponse] = await Promise.all([
        client.get('/suppliers'),
        client.get('/locations'),
        client.get('/admin/users'),
        client.get('/appointments'),
        client.get('/appointments/pallet-balances'),
      ]);

      setSuppliers(suppliersResponse.data || []);
      setLocations(locationsResponse.data || []);
      setInternalUsers(usersResponse.data || []);
      setAppointments(appointmentsResponse.data || []);
      setPalletBalances(balancesResponse.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Impossible de charger les donnees admin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const nextDrafts: Record<string, QuayCapacity> = {};
    allQuays.forEach((q) => {
      nextDrafts[q.id] = {
        maxParcelsPerDay: q.capacity?.maxParcelsPerDay ?? 100,
        maxPalletsPerDay: q.capacity?.maxPalletsPerDay ?? 100,
      };
    });
    setCapacityDrafts(nextDrafts);
  }, [allQuays]);

  const resetNotices = () => {
    setMessage('');
    setError('');
  };

  const handleCreateSupplier = async (event: FormEvent) => {
    event.preventDefault();
    resetNotices();

    try {
      await client.post('/admin/suppliers', supplierForm);
      setMessage('Fournisseur cree avec succes.');
      setSupplierForm({
        name: '',
        email: '',
        password: '',
        isGold: false,
        phone: '',
        address: '',
        postalCode: '',
        city: '',
        contact: '',
      });
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Creation du fournisseur impossible.');
    }
  };

  const handleCreateUser = async (event: FormEvent) => {
    event.preventDefault();
    resetNotices();

    try {
      await client.post('/admin/users', {
        ...userForm,
        locationId: userForm.locationId || undefined,
        quayIds: userForm.quayIds,
      });
      setMessage('Utilisateur interne cree avec succes.');
      setUserForm({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        role: 'EMPLOYEE',
        locationId: '',
        quayIds: [],
      });
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Creation de l utilisateur impossible.');
    }
  };

  const loadSupplierAssignments = async (supplierId: string) => {
    setLoadingAssignments(true);
    try {
      const res = await client.get(`/admin/suppliers/${supplierId}/assignments`);
      setSupplierAssignments(res.data || []);
    } catch {
      setSupplierAssignments([]);
    } finally {
      setLoadingAssignments(false);
    }
  };

  const openSupplierPanel = (supplier: Supplier) => {
    setEditingSupplier({ ...supplier, password: '' });
    loadSupplierAssignments(supplier.id);
  };

  const handleUpdateSupplier = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingSupplier) return;
    resetNotices();
    try {
      await client.put(`/admin/suppliers/${editingSupplier.id}`, editingSupplier);
      setMessage('Fournisseur mis a jour.');
      await loadData();
      // keep panel open with fresh data
      const refreshed = (await client.get('/suppliers')).data?.find((s: Supplier) => s.id === editingSupplier.id);
      if (refreshed) setEditingSupplier({ ...refreshed, password: '' });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Mise a jour impossible.');
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!window.confirm('Supprimer ce fournisseur ?')) return;
    resetNotices();
    try {
      await client.delete(`/admin/suppliers/${id}`);
      setMessage('Fournisseur supprime.');
      setEditingSupplier(null);
      setSupplierAssignments([]);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Suppression impossible.');
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!window.confirm('Retirer ce quai du fournisseur ?')) return;
    resetNotices();
    try {
      await client.delete(`/admin/quay-assignments/${assignmentId}`);
      setMessage('Affectation supprimee.');
      if (editingSupplier) loadSupplierAssignments(editingSupplier.id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Suppression impossible.');
    }
  };

  const handleUpdateUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingUser) return;
    resetNotices();
    try {
      await client.put(`/admin/users/${editingUser.id}`, {
        ...editingUser,
        quayIds: editingUser.assignedQuayIds,
      });
      setMessage('Utilisateur mis a jour.');
      setEditingUser(null);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Mise a jour impossible.');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('Supprimer cet utilisateur ?')) return;
    resetNotices();
    try {
      await client.delete(`/admin/users/${id}`);
      setMessage('Utilisateur supprime.');
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Suppression impossible.');
    }
  };

  const handleCreateAppointment = async (event: FormEvent) => {
    event.preventDefault();
    resetNotices();
    try {
      await client.post('/appointments', appointmentForm);
      setMessage('Rendez-vous cree avec succes.');
      setAppointmentForm({ supplierId: '', orderNumber: '', volume: 1, deliveryType: 'PALLET', scheduledDate: '', locationId: '', quayId: '', status: 'SCHEDULED' });
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Creation impossible.');
    }
  };

  const handleUpdateAppointment = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingAppointment) return;
    resetNotices();
    try {
      await client.put(`/appointments/${editingAppointment.id}`, editingAppointment);
      setMessage('Rendez-vous mis a jour.');
      setEditingAppointment(null);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Mise a jour impossible.');
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!window.confirm('Supprimer ce rendez-vous ?')) return;
    resetNotices();
    try {
      await client.delete(`/appointments/${id}`);
      setMessage('Rendez-vous supprime.');
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Suppression impossible.');
    }
  };

  const handleCreateLocation = async (event: FormEvent) => {
    event.preventDefault();
    resetNotices();

    try {
      await client.post('/admin/locations', locationForm);
      setMessage('Site de livraison cree avec succes.');
      setLocationForm({ name: '', address: '', city: '', postalCode: '', orderPrefix: '' });
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Creation du site impossible.');
    }
  };

  const handleUpdateLocation = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingLocation) return;
    resetNotices();
    try {
      await client.put(`/admin/locations/${editingLocation.id}`, editingLocation);
      setMessage('Site mis a jour.');
      setEditingLocation(null);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Mise a jour impossible.');
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (!window.confirm('Supprimer ce site ? Les quais associes seront aussi supprimes.')) return;
    resetNotices();
    try {
      await client.delete(`/admin/locations/${id}`);
      setMessage('Site supprime.');
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Suppression impossible.');
    }
  };

  const handleCreateQuay = async (event: FormEvent) => {
    event.preventDefault();
    resetNotices();

    try {
      await client.post('/admin/quays', quayForm);
      setMessage('Quai cree avec succes.');
      setQuayForm({ name: '', locationId: '' });
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Creation du quai impossible.');
    }
  };

  const handleDeleteQuay = async (id: string) => {
    if (!window.confirm('Supprimer ce quai ?')) return;
    resetNotices();
    try {
      await client.delete(`/admin/quays/${id}`);
      setMessage('Quai supprime.');
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Suppression impossible.');
    }
  };

  const handleSaveCapacity = async (quayId: string) => {
    resetNotices();
    try {
      const draft = capacityDrafts[quayId];
      if (!draft) return;
      await client.put(`/admin/quays/${quayId}/capacity`, draft);
      setMessage('Capacite du quai mise a jour.');
      await loadData();
    } catch (err: any) {
      const validationError = err.response?.data?.errors?.[0]?.msg;
      const transportError = err.message;
      setError(validationError || err.response?.data?.error || transportError || 'Mise a jour de capacite impossible.');
    }
  };

  const handleAssignQuay = async (event: FormEvent) => {
    event.preventDefault();
    resetNotices();

    try {
      await client.post('/admin/quay-assignments', assignmentForm);
      setMessage('Affectations fournisseur-quai creees.');
      setAssignmentForm({ supplierId: '', locationId: '', quayIds: [] });
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Affectation impossible.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 text-slate-900">
      <header className="border-b border-slate-300 bg-white/80 backdrop-blur">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Console Admin</h1>
            <p className="text-sm text-slate-600">Bienvenue {user?.firstName || 'Admin'}, gérez votre opération Notico.</p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
              Déconnexion
          </button>
        </div>
      </header>

      <div className="grid gap-4 px-6 py-6 md:grid-cols-[240px,1fr]">
        <aside className="rounded-xl border border-slate-300 bg-white p-3 shadow-sm">
          {[
            { id: 'overview', label: 'Vue generale' },
            { id: 'suppliers', label: 'Fournisseurs' },
            { id: 'users', label: 'Utilisateurs' },
            { id: 'locations', label: 'Sites' },
            { id: 'quays', label: 'Quais' },
            { id: 'capacities', label: 'Capacites max' },
            { id: 'assignments', label: 'Affectations' },
            { id: 'appointments', label: 'Rendez-vous' },
          ].map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id as AdminSection)}
              className={`mb-2 block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                activeSection === section.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {section.label}
            </button>
          ))}
        </aside>

        <main className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm">
          {loading ? <p className="text-slate-600">Chargement...</p> : null}

          {message ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}
          {error ? <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

          {activeSection === 'overview' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Vue générale</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-900 p-4 text-white">
                  <p className="text-xs uppercase tracking-wide text-slate-300">Fournisseurs</p>
                  <p className="mt-1 text-3xl font-black">{suppliers.length}</p>
                </div>
                <div className="rounded-xl bg-slate-800 p-4 text-white">
                  <p className="text-xs uppercase tracking-wide text-slate-300">Sites</p>
                  <p className="mt-1 text-3xl font-black">{locations.length}</p>
                </div>
                <div className="rounded-xl bg-slate-700 p-4 text-white">
                  <p className="text-xs uppercase tracking-wide text-slate-300">Quais</p>
                  <p className="mt-1 text-3xl font-black">{allQuays.length}</p>
                </div>
              </div>
              <button
                onClick={loadData}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Rafraîchir les données
              </button>
            </div>
          )}

          {activeSection === 'suppliers' && (
            <div className="flex gap-6" style={{ minHeight: '70vh' }}>
              {/* Colonne gauche : liste + création */}
              <div className="flex w-80 shrink-0 flex-col gap-4">
                {/* Créer un fournisseur */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Nouveau fournisseur</h2>
                  <form onSubmit={handleCreateSupplier} className="flex flex-col gap-2">
                    <input className="rounded border p-2 text-sm" placeholder="Nom" required value={supplierForm.name} onChange={(e) => setSupplierForm((prev) => ({ ...prev, name: e.target.value }))} />
                    <input className="rounded border p-2 text-sm" placeholder="Identifiant / Email" required type="text" value={supplierForm.email} onChange={(e) => setSupplierForm((prev) => ({ ...prev, email: e.target.value }))} />
                    <input className="rounded border p-2 text-sm" placeholder="Mot de passe" required minLength={6} type="password" value={supplierForm.password} onChange={(e) => setSupplierForm((prev) => ({ ...prev, password: e.target.value }))} />
                    <label className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <input
                        type="checkbox"
                        checked={supplierForm.isGold}
                        onChange={(e) => setSupplierForm((prev) => ({ ...prev, isGold: e.target.checked }))}
                      />
                      Accès Gold (ignore la capacité de réception)
                    </label>
                    <input className="rounded border p-2 text-sm" placeholder="Telephone" required value={supplierForm.phone} onChange={(e) => setSupplierForm((prev) => ({ ...prev, phone: e.target.value }))} />
                    <input className="rounded border p-2 text-sm" placeholder="Contact" value={supplierForm.contact} onChange={(e) => setSupplierForm((prev) => ({ ...prev, contact: e.target.value }))} />
                    <input className="rounded border p-2 text-sm" placeholder="Adresse" value={supplierForm.address} onChange={(e) => setSupplierForm((prev) => ({ ...prev, address: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-2">
                      <input className="rounded border p-2 text-sm" placeholder="Code postal" value={supplierForm.postalCode} onChange={(e) => setSupplierForm((prev) => ({ ...prev, postalCode: e.target.value }))} />
                      <input className="rounded border p-2 text-sm" placeholder="Ville" value={supplierForm.city} onChange={(e) => setSupplierForm((prev) => ({ ...prev, city: e.target.value }))} />
                    </div>
                    <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700">Créer fournisseur</button>
                  </form>
                </div>

                {/* Liste fournisseurs */}
                <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">{suppliers.length} fournisseurs</span>
                  </div>
                  <input
                    className="mb-3 w-full rounded border p-2 text-sm"
                    placeholder="Rechercher par nom, identifiant ou ville…"
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                  />
                  <div className="space-y-1">
                    {suppliers
                      .filter((s) => {
                        const q = supplierSearch.toLowerCase();
                        return !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q);
                      })
                      .map((supplier) => (
                        <button
                          key={supplier.id}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                            editingSupplier?.id === supplier.id
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                          onClick={() => openSupplierPanel(supplier)}
                        >
                          <p className="font-semibold truncate">
                            {supplier.name}
                            {supplier.isGold && (
                              <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${editingSupplier?.id === supplier.id ? 'bg-amber-300 text-amber-900' : 'bg-amber-100 text-amber-800'}`}>
                                GOLD
                              </span>
                            )}
                          </p>
                          <p className={`truncate text-xs ${editingSupplier?.id === supplier.id ? 'text-slate-300' : 'text-slate-500'}`}>
                            {supplier.email}{supplier.city ? ` · ${supplier.city}` : ''}
                          </p>
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              {/* Colonne droite : fiche fournisseur */}
              {editingSupplier ? (
                <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-5 flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">
                        {editingSupplier.name}
                        {editingSupplier.isGold && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">GOLD</span>}
                      </h2>
                      <p className="text-sm text-slate-500">{editingSupplier.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteSupplier(editingSupplier.id)}
                        className="rounded bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                      >
                        Supprimer
                      </button>
                      <button
                        onClick={() => { setEditingSupplier(null); setSupplierAssignments([]); }}
                        className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                      >
                        Fermer
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Formulaire d'édition */}
                    <div>
                      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Informations</h3>
                      <form onSubmit={handleUpdateSupplier} className="grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-xs font-semibold text-slate-500">Nom</label>
                          <input className="w-full rounded border p-2" required value={editingSupplier.name} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, name: e.target.value }))} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-500">Identifiant</label>
                          <input className="w-full rounded border p-2" type="text" required value={editingSupplier.email} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, email: e.target.value }))} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-500">Nouveau mot de passe</label>
                          <input className="w-full rounded border p-2" placeholder="(optionnel)" type="password" minLength={6} value={editingSupplier.password || ''} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, password: e.target.value }))} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            <input
                              type="checkbox"
                              checked={Boolean(editingSupplier.isGold)}
                              onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, isGold: e.target.checked }))}
                            />
                            Accès Gold (ce fournisseur peut réserver même si la capacité est atteinte)
                          </label>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-500">Téléphone</label>
                          <input className="w-full rounded border p-2" value={editingSupplier.phone} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, phone: e.target.value }))} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-500">Contact</label>
                          <input className="w-full rounded border p-2" value={editingSupplier.contact} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, contact: e.target.value }))} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-xs font-semibold text-slate-500">Adresse</label>
                          <input className="w-full rounded border p-2" value={editingSupplier.address} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, address: e.target.value }))} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-500">Code postal</label>
                          <input className="w-full rounded border p-2" value={editingSupplier.postalCode} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, postalCode: e.target.value }))} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-500">Ville</label>
                          <input className="w-full rounded border p-2" value={editingSupplier.city} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, city: e.target.value }))} />
                        </div>
                        <div className="sm:col-span-2">
                          <button type="submit" className="rounded bg-slate-900 px-5 py-2 text-white hover:bg-slate-700">Enregistrer les modifications</button>
                        </div>
                      </form>
                    </div>

                    {/* Quais affectés */}
                    <div>
                      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Quais affectés</h3>
                      {loadingAssignments ? (
                        <p className="text-sm text-slate-400">Chargement…</p>
                      ) : supplierAssignments.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">Aucun quai affecté pour ce fournisseur.</p>
                      ) : (
                        <div className="space-y-3">
                          {Object.values(
                            supplierAssignments.reduce<Record<string, { locationName: string; items: SupplierAssignment[] }>>((acc, a) => {
                              const locId = a.quay.location.id;
                              if (!acc[locId]) acc[locId] = { locationName: a.quay.location.name, items: [] };
                              acc[locId].items.push(a);
                              return acc;
                            }, {})
                          ).map((group) => (
                            <div key={group.locationName} className="rounded-lg border border-slate-200 p-3">
                              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{group.locationName}</p>
                              <div className="flex flex-wrap gap-2">
                                {group.items.map((a) => (
                                  <span
                                    key={a.id}
                                    className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                                  >
                                    {a.quay.name}
                                    <button
                                      onClick={() => handleDeleteAssignment(a.id)}
                                      className="ml-1 text-slate-400 hover:text-red-600 font-bold leading-none"
                                      title="Retirer ce quai"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 rounded-lg border border-slate-200 p-3">
                        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Suivi palettes</h4>
                        <div className="space-y-1 text-sm text-slate-700">
                          <p>Reçues: <span className="font-semibold">{selectedSupplierBalance?.palletsReceived || 0}</span></p>
                          <p>Rendues: <span className="font-semibold">{selectedSupplierBalance?.palletsReturned || 0}</span></p>
                          <p>
                            Solde:{' '}
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              (selectedSupplierBalance?.balance || 0) > 0
                                ? 'bg-amber-100 text-amber-800'
                                : (selectedSupplierBalance?.balance || 0) < 0
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {(selectedSupplierBalance?.balance || 0) > 0
                                ? `Nous devons ${selectedSupplierBalance?.balance}`
                                : (selectedSupplierBalance?.balance || 0) < 0
                                  ? `${Math.abs(selectedSupplierBalance?.balance || 0)} rendu(es) en trop`
                                  : 'Equilibré'}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-lg border border-slate-200 p-3">
                        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Fiabilité livraison</h4>
                        <div className="space-y-1 text-sm text-slate-700">
                          <p>Livraisons livrées: <span className="font-semibold">{selectedSupplierReliability?.deliveredCount || 0}</span></p>
                          <p>Livrées à la date prévue: <span className="font-semibold">{selectedSupplierReliability?.deliveredOnPlannedDateCount || 0}</span></p>
                          <p>
                            Taux de fiabilité:{' '}
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              (selectedSupplierReliability?.onTimeRate || 0) >= 90
                                ? 'bg-emerald-100 text-emerald-800'
                                : (selectedSupplierReliability?.onTimeRate || 0) >= 75
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                            }`}>
                              {selectedSupplierReliability?.onTimeRate || 0}%
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                  <p className="text-sm">Sélectionnez un fournisseur pour voir sa fiche</p>
                </div>
              )}
            </div>
          )}

          {activeSection === 'users' && (
            <div className="space-y-6">
              {/* Modal édition utilisateur */}
              {editingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditingUser(null)}>
                  <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg">Modifier {editingUser.firstName} {editingUser.lastName}</h3>
                      <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">×</button>
                    </div>
                    <form onSubmit={handleUpdateUser} className="grid gap-3 sm:grid-cols-2">
                      <input className="rounded border p-2" placeholder="Identifiant" type="text" required value={editingUser.email} onChange={(e) => setEditingUser((prev) => prev && ({ ...prev, email: e.target.value }))} />
                      <input className="rounded border p-2" placeholder="Nouveau mot de passe (optionnel)" type="password" value={editingUser.password || ''} onChange={(e) => setEditingUser((prev) => prev && ({ ...prev, password: e.target.value }))} />
                      <input className="rounded border p-2" placeholder="Prenom" required value={editingUser.firstName} onChange={(e) => setEditingUser((prev) => prev && ({ ...prev, firstName: e.target.value }))} />
                      <input className="rounded border p-2" placeholder="Nom" value={editingUser.lastName} onChange={(e) => setEditingUser((prev) => prev && ({ ...prev, lastName: e.target.value }))} />
                      <select className="rounded border p-2" value={editingUser.role} onChange={(e) => setEditingUser((prev) => prev && ({ ...prev, role: e.target.value }))}>
                        <option value="EMPLOYEE">Employe</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                      <select className="rounded border p-2" value={editingUser.locationId || ''} onChange={(e) => setEditingUser((prev) => prev && ({ ...prev, locationId: e.target.value || null, assignedQuayIds: [] }))}>
                        <option value="">Sans site</option>
                        {locations.map((location) => (
                          <option key={location.id} value={location.id}>{location.name}</option>
                        ))}
                      </select>
                      {editingUser.locationId && (() => {
                        const siteQuays = locations.find((l) => l.id === editingUser.locationId)?.quays || [];
                        return siteQuays.length > 0 ? (
                          <div className="sm:col-span-2">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Quais accessibles</p>
                            <div className="grid grid-cols-2 gap-1">
                              {siteQuays.map((q) => (
                                <label key={q.id} className="flex items-center gap-2 rounded border p-2 text-sm cursor-pointer hover:bg-slate-50">
                                  <input
                                    type="checkbox"
                                    checked={editingUser.assignedQuayIds.includes(q.id)}
                                    onChange={(e) => setEditingUser((prev) => {
                                      if (!prev) return prev;
                                      const ids = e.target.checked
                                        ? [...prev.assignedQuayIds, q.id]
                                        : prev.assignedQuayIds.filter((id) => id !== q.id);
                                      return { ...prev, assignedQuayIds: ids };
                                    })}
                                  />
                                  {q.name}
                                </label>
                              ))}
                            </div>
                          </div>
                        ) : null;
                      })()}
                      <div className="flex gap-2 sm:col-span-2">
                        <button type="submit" className="flex-1 rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Enregistrer</button>
                        <button type="button" onClick={() => setEditingUser(null)} className="rounded border px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Annuler</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              <div>
                <h2 className="text-xl font-bold mb-3">Créer un utilisateur interne</h2>
                <form onSubmit={handleCreateUser} className="grid gap-3 sm:grid-cols-2">
                  <input className="rounded border p-2" placeholder="Identifiant" type="text" required value={userForm.email} onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))} />
                  <input className="rounded border p-2" placeholder="Mot de passe" type="password" required minLength={6} value={userForm.password} onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))} />
                  <input className="rounded border p-2" placeholder="Prenom" required value={userForm.firstName} onChange={(e) => setUserForm((prev) => ({ ...prev, firstName: e.target.value }))} />
                  <input className="rounded border p-2" placeholder="Nom" value={userForm.lastName} onChange={(e) => setUserForm((prev) => ({ ...prev, lastName: e.target.value }))} />
                  <select className="rounded border p-2" value={userForm.role} onChange={(e) => setUserForm((prev) => ({ ...prev, role: e.target.value }))}>
                    <option value="EMPLOYEE">Employe</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <select className="rounded border p-2" value={userForm.locationId} onChange={(e) => setUserForm((prev) => ({ ...prev, locationId: e.target.value, quayIds: [] }))}>
                    <option value="">Sans site</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                  </select>
                  {userForm.locationId && (() => {
                    const siteQuays = locations.find((l) => l.id === userForm.locationId)?.quays || [];
                    return siteQuays.length > 0 ? (
                      <div className="sm:col-span-2">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Quais accessibles</p>
                        <div className="grid grid-cols-2 gap-1">
                          {siteQuays.map((q) => (
                            <label key={q.id} className="flex items-center gap-2 rounded border p-2 text-sm cursor-pointer hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={userForm.quayIds.includes(q.id)}
                                onChange={(e) => setUserForm((prev) => {
                                  const ids = e.target.checked
                                    ? [...prev.quayIds, q.id]
                                    : prev.quayIds.filter((id) => id !== q.id);
                                  return { ...prev, quayIds: ids };
                                })}
                              />
                              {q.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                  <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 sm:col-span-2">Créer utilisateur</button>
                </form>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Utilisateurs ({internalUsers.length})</h3>
                <div className="space-y-2">
                  {internalUsers.map((u) => (
                    <div key={u.id} className="flex items-center justify-between rounded border border-slate-200 p-3 text-sm">
                      <div>
                        <p className="font-semibold">{u.firstName} {u.lastName}</p>
                        <p className="text-slate-500">{u.email} · <span className="font-mono">{u.role}</span>{u.locationId ? ` · ${locations.find((l) => l.id === u.locationId)?.name || u.locationId}` : ''}</p>
                        {u.assignedQuayIds.length > 0 && (
                          <p className="text-slate-400 text-xs">Quais : {u.assignedQuayIds.map((qid) => allQuays.find((q) => q.id === qid)?.name || qid).join(', ')}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingUser({ ...u, password: '' })} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">Modifier</button>
                        <button onClick={() => handleDeleteUser(u.id)} className="rounded bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700">Supprimer</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'locations' && (
            <div className="space-y-4">
              {/* Modal édition site */}
              {editingLocation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditingLocation(null)}>
                  <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg">Modifier {editingLocation.name}</h3>
                      <button onClick={() => setEditingLocation(null)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">×</button>
                    </div>
                    <form onSubmit={handleUpdateLocation} className="grid gap-3 sm:grid-cols-2">
                      <input className="rounded border p-2" placeholder="Nom du site" required value={editingLocation.name} onChange={(e) => setEditingLocation((prev) => prev && ({ ...prev, name: e.target.value }))} />
                      <input className="rounded border p-2" placeholder="Adresse" required value={editingLocation.address} onChange={(e) => setEditingLocation((prev) => prev && ({ ...prev, address: e.target.value }))} />
                      <input className="rounded border p-2" placeholder="Ville" required value={editingLocation.city} onChange={(e) => setEditingLocation((prev) => prev && ({ ...prev, city: e.target.value }))} />
                      <input className="rounded border p-2" placeholder="Code postal" required value={editingLocation.postalCode} onChange={(e) => setEditingLocation((prev) => prev && ({ ...prev, postalCode: e.target.value }))} />
                      <input
                        className="rounded border p-2"
                        placeholder="Prefixe commande (5 chiffres)"
                        required
                        pattern="[0-9]{5}"
                        value={editingLocation.orderPrefix || ''}
                        onChange={(e) => setEditingLocation((prev) => prev && ({ ...prev, orderPrefix: e.target.value }))}
                      />
                      <div className="flex gap-2 sm:col-span-2">
                        <button type="submit" className="flex-1 rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Enregistrer</button>
                        <button type="button" onClick={() => setEditingLocation(null)} className="rounded border px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Annuler</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              <h2 className="text-xl font-bold">Créer un site</h2>
              <form onSubmit={handleCreateLocation} className="grid gap-3 sm:grid-cols-2">
                <input className="rounded border p-2" placeholder="Nom du site" required value={locationForm.name} onChange={(e) => setLocationForm((prev) => ({ ...prev, name: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Adresse" required value={locationForm.address} onChange={(e) => setLocationForm((prev) => ({ ...prev, address: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Ville" required value={locationForm.city} onChange={(e) => setLocationForm((prev) => ({ ...prev, city: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Code postal" required value={locationForm.postalCode} onChange={(e) => setLocationForm((prev) => ({ ...prev, postalCode: e.target.value }))} />
                <input
                  className="rounded border p-2"
                  placeholder="Prefixe commande (5 chiffres)"
                  required
                  pattern="[0-9]{5}"
                  value={locationForm.orderPrefix}
                  onChange={(e) => setLocationForm((prev) => ({ ...prev, orderPrefix: e.target.value }))}
                />
                <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Créer site</button>
              </form>

              <div className="space-y-2">
                {locations.map((location) => (
                  <div key={location.id} className="flex items-center justify-between rounded border border-slate-200 p-3 text-sm">
                    <div>
                      <p className="font-semibold">{location.name}</p>
                      <p className="text-slate-600">{location.address}, {location.city} {location.postalCode}</p>
                      <p className="text-slate-500 text-xs">Prefixe commande: {location.orderPrefix || 'Non defini'}</p>
                      <p className="text-slate-400 text-xs">{location.quays.length} quai(s)</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingLocation(location)} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">Modifier</button>
                      <button onClick={() => handleDeleteLocation(location.id)} className="rounded bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700">Supprimer</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'quays' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Créer un quai</h2>
              <form onSubmit={handleCreateQuay} className="grid gap-3 sm:grid-cols-2">
                <input className="rounded border p-2" placeholder="Nom du quai" required value={quayForm.name} onChange={(e) => setQuayForm((prev) => ({ ...prev, name: e.target.value }))} />
                <select className="rounded border p-2" required value={quayForm.locationId} onChange={(e) => setQuayForm((prev) => ({ ...prev, locationId: e.target.value }))}>
                  <option value="">Selectionner un site</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
                <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Créer quai</button>
              </form>

              <div className="space-y-2">
                {allQuays.map((quay) => (
                  <div key={quay.id} className="flex items-center justify-between rounded border border-slate-200 p-3 text-sm">
                    <div>
                      <p className="font-semibold">{quay.name}</p>
                      <p className="text-slate-600">Site: {quay.locationName}</p>
                    </div>
                    <button onClick={() => handleDeleteQuay(quay.id)} className="rounded bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700">Supprimer</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'capacities' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Parametres des capacites max</h2>
              <p className="text-sm text-slate-600">Definissez la capacite journaliere de chaque quai en colis et en palettes.</p>

              <div className="space-y-2">
                {allQuays.map((quay) => {
                  const draft = capacityDrafts[quay.id] || { maxParcelsPerDay: 100, maxPalletsPerDay: 100 };
                  return (
                    <div key={quay.id} className="rounded border border-slate-200 p-3 text-sm">
                      <div className="mb-2">
                        <p className="font-semibold">{quay.name}</p>
                        <p className="text-slate-600">Site: {quay.locationName}</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-600">Colis max / jour</label>
                          <input
                            className="w-full rounded border p-2"
                            type="number"
                            min={0}
                            value={draft.maxParcelsPerDay}
                            onChange={(e) => setCapacityDrafts((prev) => ({
                              ...prev,
                              [quay.id]: {
                                ...draft,
                                maxParcelsPerDay: Number(e.target.value) || 0,
                              },
                            }))}
                            placeholder="Colis"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-600">Palettes max / jour</label>
                          <input
                            className="w-full rounded border p-2"
                            type="number"
                            min={0}
                            value={draft.maxPalletsPerDay}
                            onChange={(e) => setCapacityDrafts((prev) => ({
                              ...prev,
                              [quay.id]: {
                                ...draft,
                                maxPalletsPerDay: Number(e.target.value) || 0,
                              },
                            }))}
                            placeholder="Palettes"
                          />
                        </div>
                        <button
                          onClick={() => handleSaveCapacity(quay.id)}
                          className="rounded bg-slate-900 px-3 py-2 text-white hover:bg-slate-700"
                        >
                          Sauvegarder
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeSection === 'assignments' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Affecter des quais à un fournisseur</h2>
              <p className="text-sm text-slate-600">Un meme fournisseur peut etre autorise sur plusieurs sites. Pour chaque site, selectionnez un ou plusieurs quais predefinis.</p>
              <form onSubmit={handleAssignQuay} className="grid gap-3 sm:grid-cols-2">
                <select className="rounded border p-2" required value={assignmentForm.supplierId} onChange={(e) => setAssignmentForm((prev) => ({ ...prev, supplierId: e.target.value }))}>
                  <option value="">Selectionner un fournisseur</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
                <select className="rounded border p-2" required value={assignmentForm.locationId} onChange={(e) => setAssignmentForm((prev) => ({ ...prev, locationId: e.target.value, quayIds: [] }))}>
                  <option value="">Selectionner un site</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
                <div className="sm:col-span-2 rounded border border-slate-200 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Quais autorises pour ce site</p>
                  {!assignmentForm.locationId ? (
                    <p className="text-sm text-slate-500">Selectionnez d abord un site.</p>
                  ) : assignmentQuays.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucun quai disponible sur ce site.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {assignmentQuays.map((quay) => (
                        <label key={quay.id} className="flex items-center gap-2 rounded border border-slate-200 p-2 text-sm cursor-pointer hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={assignmentForm.quayIds.includes(quay.id)}
                            onChange={(e) => setAssignmentForm((prev) => {
                              const nextIds = e.target.checked
                                ? [...prev.quayIds, quay.id]
                                : prev.quayIds.filter((id) => id !== quay.id);
                              return { ...prev, quayIds: nextIds };
                            })}
                          />
                          <span>{quay.name} ({quay.locationName})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 sm:col-span-2">Créer affectation(s)</button>
              </form>
            </div>
          )}

          {activeSection === 'appointments' && (
            <div className="space-y-6">
              {/* Modal édition rendez-vous */}
              {editingAppointment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditingAppointment(null)}>
                  <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg">Modifier le rendez-vous</h3>
                      <button onClick={() => setEditingAppointment(null)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">×</button>
                    </div>
                    <form onSubmit={handleUpdateAppointment} className="grid gap-3 sm:grid-cols-2">
                      <select className="rounded border p-2 sm:col-span-2" required value={editingAppointment.supplierId} onChange={(e) => setEditingAppointment((prev) => prev && ({ ...prev, supplierId: e.target.value }))}>
                        <option value="">Fournisseur</option>
                        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <input className="rounded border p-2" placeholder="N° commande" required value={editingAppointment.orderNumber} onChange={(e) => setEditingAppointment((prev) => prev && ({ ...prev, orderNumber: e.target.value }))} />
                      <input className="rounded border p-2" placeholder="Volume" type="number" min={1} required value={editingAppointment.volume} onChange={(e) => setEditingAppointment((prev) => prev && ({ ...prev, volume: Number(e.target.value) }))} />
                      <select className="rounded border p-2" value={editingAppointment.deliveryType} onChange={(e) => setEditingAppointment((prev) => prev && ({ ...prev, deliveryType: e.target.value as 'PALLET' | 'PARCEL' }))}>
                        <option value="PALLET">Palettes</option>
                        <option value="PARCEL">Colis</option>
                      </select>
                      <input className="rounded border p-2" type="datetime-local" required value={editingAppointment.scheduledDate.slice(0, 16)} onChange={(e) => setEditingAppointment((prev) => prev && ({ ...prev, scheduledDate: e.target.value }))} />
                      <select className="rounded border p-2" value={editingAppointment.locationId || ''} onChange={(e) => setEditingAppointment((prev) => prev && ({ ...prev, locationId: e.target.value || null }))}>
                        <option value="">Site (optionnel)</option>
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                      <select className="rounded border p-2" value={editingAppointment.status} onChange={(e) => setEditingAppointment((prev) => prev && ({ ...prev, status: e.target.value as AppointmentStatus }))}>
                        <option value="SCHEDULED">Planifie</option>
                        <option value="DELIVERED">Livre</option>
                        <option value="RESCHEDULED">Reporte</option>
                        <option value="NO_SHOW">Absent</option>
                        <option value="CANCELLED">Annule</option>
                      </select>
                      <div className="flex gap-2 sm:col-span-2">
                        <button type="submit" className="flex-1 rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Enregistrer</button>
                        <button type="button" onClick={() => setEditingAppointment(null)} className="rounded border px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Annuler</button>
                      </div>
                    </form>
                    {editingAppointment.statusHistory && editingAppointment.statusHistory.length > 0 && (
                      <div className="mt-4 border-t border-slate-200 pt-3">
                        <p className="mb-2 text-sm font-semibold text-slate-700">Historique des statuts</p>
                        <div className="max-h-36 space-y-1 overflow-auto rounded border border-slate-200 bg-slate-50 p-2">
                          {editingAppointment.statusHistory.map((entry) => (
                            <p key={entry.id} className="text-xs text-slate-600">
                              {new Date(entry.changedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                              {' · '}
                              {entry.fromStatus ? `${entry.fromStatus} -> ` : ''}{entry.toStatus}
                              {' · par '}
                              {formatAppointmentAuditActor(editingAppointment, entry.changedByRole, entry.changedByUser)}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <h2 className="text-xl font-bold mb-3">Créer un rendez-vous</h2>
                <form onSubmit={handleCreateAppointment} className="grid gap-3 sm:grid-cols-2">
                  <select className="rounded border p-2 sm:col-span-2" required value={appointmentForm.supplierId} onChange={(e) => setAppointmentForm((prev) => ({ ...prev, supplierId: e.target.value }))}>
                    <option value="">Selectionner un fournisseur</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <input className="rounded border p-2" placeholder="N° commande" required value={appointmentForm.orderNumber} onChange={(e) => setAppointmentForm((prev) => ({ ...prev, orderNumber: e.target.value }))} />
                  <input className="rounded border p-2" placeholder="Volume" type="number" min={1} required value={appointmentForm.volume} onChange={(e) => setAppointmentForm((prev) => ({ ...prev, volume: Number(e.target.value) }))} />
                  <select className="rounded border p-2" value={appointmentForm.deliveryType} onChange={(e) => setAppointmentForm((prev) => ({ ...prev, deliveryType: e.target.value as 'PALLET' | 'PARCEL' }))}>
                    <option value="PALLET">Palettes</option>
                    <option value="PARCEL">Colis</option>
                  </select>
                  <input className="rounded border p-2" type="datetime-local" required value={appointmentForm.scheduledDate} onChange={(e) => setAppointmentForm((prev) => ({ ...prev, scheduledDate: e.target.value }))} />
                  <select className="rounded border p-2 sm:col-span-2" required value={appointmentForm.locationId} onChange={(e) => setAppointmentForm((prev) => ({ ...prev, locationId: e.target.value, quayId: '' }))}>
                    <option value="">Selectionner un site</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <select className="rounded border p-2 sm:col-span-2" required value={appointmentForm.quayId} onChange={(e) => setAppointmentForm((prev) => ({ ...prev, quayId: e.target.value }))}>
                    <option value="">Selectionner un quai</option>
                    {appointmentQuays.map((q) => <option key={q.id} value={q.id}>{q.name} · {q.locationName}</option>)}
                  </select>
                  <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 sm:col-span-2">Créer rendez-vous</button>
                </form>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Rendez-vous ({appointments.length})</h3>
                <div className="space-y-2">
                  {appointments.map((appt) => (
                    <div key={appt.id} className="flex items-center justify-between rounded border border-slate-200 p-3 text-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{appt.supplier?.name || appt.supplierId}</p>
                          <span className="rounded-full border px-2 py-0.5 text-xs font-bold text-slate-600">{appt.status}</span>
                        </div>
                        <p className="text-slate-500">
                          Cmd {appt.orderNumber} · {appt.volume} {appt.deliveryType === 'PALLET' ? 'pal.' : 'colis'}
                          {' · '}{new Date(appt.scheduledDate).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                          {appt.location ? ` · ${appt.location.name}` : ''}
                        </p>
                        {appt.statusHistory && appt.statusHistory.length > 0 && (
                          <p className="text-xs text-slate-400">
                            Derniere maj statut: {new Date(appt.statusHistory[0].changedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                            {' · par '}
                            {formatAppointmentAuditActor(appt, appt.statusHistory[0].changedByRole, appt.statusHistory[0].changedByUser)}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingAppointment(appt)} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">Modifier</button>
                        <button onClick={() => handleDeleteAppointment(appt.id)} className="rounded bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700">Supprimer</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'reliability' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Fiabilité fournisseurs</h2>
                <p className="text-xs text-slate-500">KPI: livraisons réceptionnées à la date prévue</p>
              </div>

              {supplierReliability.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Aucune livraison livrée disponible pour calculer la fiabilité.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2">Fournisseur</th>
                        <th className="px-3 py-2">Livraisons livrées</th>
                        <th className="px-3 py-2">Livrées à la date prévue</th>
                        <th className="px-3 py-2">Fiabilité</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierReliability.map((row) => (
                        <tr key={row.supplierId} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-semibold text-slate-800">{row.supplierName}</td>
                          <td className="px-3 py-2 text-slate-600">{row.deliveredCount}</td>
                          <td className="px-3 py-2 text-slate-600">{row.deliveredOnPlannedDateCount}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              row.onTimeRate >= 90
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.onTimeRate >= 75
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                            }`}>
                              {row.onTimeRate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
