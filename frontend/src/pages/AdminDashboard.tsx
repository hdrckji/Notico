import { FormEvent, useEffect, useMemo, useState } from 'react';
import client from '../services/api';
import { useAuthStore } from '../store/authStore';

type AdminSection = 'overview' | 'suppliers' | 'users' | 'locations' | 'quays' | 'assignments' | 'appointments';
type AppointmentStatus = 'SCHEDULED' | 'DELIVERED' | 'RESCHEDULED' | 'NO_SHOW' | 'CANCELLED';

interface Appointment {
  id: string;
  orderNumber: string;
  volume: number;
  deliveryType: 'PALLET' | 'PARCEL';
  scheduledDate: string;
  status: AppointmentStatus;
  supplierId: string;
  locationId: string | null;
  supplier?: { name: string };
  location?: { name: string };
}

interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  contact: string;
  maxDailyVolume: number;
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
}

interface Location {
  id: string;
  name: string;
  city: string;
  quays: Quay[];
}

export default function AdminDashboard() {
  const { logout, user } = useAuthStore();
  const [activeSection, setActiveSection] = useState<AdminSection>('overview');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [internalUsers, setInternalUsers] = useState<InternalUser[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
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
    status: 'SCHEDULED' as AppointmentStatus,
  });

  const [supplierForm, setSupplierForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    postalCode: '',
    city: '',
    contact: '',
    maxDailyVolume: 100,
  });

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
  });

  const [quayForm, setQuayForm] = useState({
    name: '',
    locationId: '',
  });

  const [assignmentForm, setAssignmentForm] = useState({
    supplierId: '',
    quayId: '',
  });

  const allQuays = useMemo(
    () => locations.flatMap((location) => location.quays.map((quay) => ({ ...quay, locationName: location.name }))),
    [locations]
  );

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [suppliersResponse, locationsResponse, usersResponse, appointmentsResponse] = await Promise.all([
        client.get('/suppliers'),
        client.get('/locations'),
        client.get('/admin/users'),
        client.get('/appointments'),
      ]);

      setSuppliers(suppliersResponse.data || []);
      setLocations(locationsResponse.data || []);
      setInternalUsers(usersResponse.data || []);
      setAppointments(appointmentsResponse.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Impossible de charger les donnees admin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
        phone: '',
        address: '',
        postalCode: '',
        city: '',
        contact: '',
        maxDailyVolume: 100,
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

  const handleUpdateSupplier = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingSupplier) return;
    resetNotices();
    try {
      await client.put(`/admin/suppliers/${editingSupplier.id}`, editingSupplier);
      setMessage('Fournisseur mis a jour.');
      setEditingSupplier(null);
      await loadData();
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
      await loadData();
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
      setAppointmentForm({ supplierId: '', orderNumber: '', volume: 1, deliveryType: 'PALLET', scheduledDate: '', locationId: '', status: 'SCHEDULED' });
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
      setLocationForm({ name: '', address: '', city: '', postalCode: '' });
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

  const handleAssignQuay = async (event: FormEvent) => {
    event.preventDefault();
    resetNotices();

    try {
      await client.post('/admin/quay-assignments', assignmentForm);
      setMessage('Affectation fournisseur-quai creee.');
      setAssignmentForm({ supplierId: '', quayId: '' });
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Affectation impossible.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 text-slate-900">
      <header className="border-b border-slate-300 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
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

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 md:grid-cols-[240px,1fr]">
        <aside className="rounded-xl border border-slate-300 bg-white p-3 shadow-sm">
          {[
            { id: 'overview', label: 'Vue generale' },
            { id: 'suppliers', label: 'Fournisseurs' },
            { id: 'users', label: 'Utilisateurs' },
            { id: 'locations', label: 'Sites' },
            { id: 'quays', label: 'Quais' },
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
            <div className="space-y-6">
              {/* Modal édition fournisseur */}
              {editingSupplier && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditingSupplier(null)}>
                  <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg">Modifier {editingSupplier.name}</h3>
                      <button onClick={() => setEditingSupplier(null)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">×</button>
                    </div>
                    <form onSubmit={handleUpdateSupplier} className="grid gap-3 sm:grid-cols-2">
                      <input className="rounded border p-2" placeholder="Nom" required value={editingSupplier.name} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, name: e.target.value }))} />
                      <input className="rounded border p-2" placeholder="Identifiant" type="text" required value={editingSupplier.email} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, email: e.target.value }))} />
                      <input className="rounded border p-2" placeholder="Telephone" value={editingSupplier.phone} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, phone: e.target.value }))} />
                      <input className="rounded border p-2" placeholder="Contact" value={editingSupplier.contact} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, contact: e.target.value }))} />
                      <input className="rounded border p-2 sm:col-span-2" placeholder="Adresse" value={editingSupplier.address} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, address: e.target.value }))} />
                      <input className="rounded border p-2" placeholder="Code postal" value={editingSupplier.postalCode} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, postalCode: e.target.value }))} />
                      <input className="rounded border p-2" placeholder="Ville" value={editingSupplier.city} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, city: e.target.value }))} />
                      <input className="rounded border p-2" placeholder="Volume max/jour" type="number" min={1} value={editingSupplier.maxDailyVolume} onChange={(e) => setEditingSupplier((prev) => prev && ({ ...prev, maxDailyVolume: Number(e.target.value) || 1 }))} />
                      <div className="flex gap-2 sm:col-span-2">
                        <button type="submit" className="flex-1 rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Enregistrer</button>
                        <button type="button" onClick={() => setEditingSupplier(null)} className="rounded border px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Annuler</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              <div>
                <h2 className="text-xl font-bold mb-3">Créer un fournisseur</h2>
                <form onSubmit={handleCreateSupplier} className="grid gap-3 sm:grid-cols-2">
                  <input className="rounded border p-2" placeholder="Nom" required value={supplierForm.name} onChange={(e) => setSupplierForm((prev) => ({ ...prev, name: e.target.value }))} />
                  <input className="rounded border p-2" placeholder="Identifiant / Email" required type="text" value={supplierForm.email} onChange={(e) => setSupplierForm((prev) => ({ ...prev, email: e.target.value }))} />
                  <input className="rounded border p-2" placeholder="Telephone" required value={supplierForm.phone} onChange={(e) => setSupplierForm((prev) => ({ ...prev, phone: e.target.value }))} />
                  <input className="rounded border p-2" placeholder="Contact" value={supplierForm.contact} onChange={(e) => setSupplierForm((prev) => ({ ...prev, contact: e.target.value }))} />
                  <input className="rounded border p-2 sm:col-span-2" placeholder="Adresse" value={supplierForm.address} onChange={(e) => setSupplierForm((prev) => ({ ...prev, address: e.target.value }))} />
                  <input className="rounded border p-2" placeholder="Code postal" value={supplierForm.postalCode} onChange={(e) => setSupplierForm((prev) => ({ ...prev, postalCode: e.target.value }))} />
                  <input className="rounded border p-2" placeholder="Ville" value={supplierForm.city} onChange={(e) => setSupplierForm((prev) => ({ ...prev, city: e.target.value }))} />
                  <input className="rounded border p-2" placeholder="Volume max/jour" type="number" min={1} value={supplierForm.maxDailyVolume} onChange={(e) => setSupplierForm((prev) => ({ ...prev, maxDailyVolume: Number(e.target.value) || 1 }))} />
                  <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Créer fournisseur</button>
                </form>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Fournisseurs ({suppliers.length})</h3>
                <div className="space-y-2">
                  {suppliers.map((supplier) => (
                    <div key={supplier.id} className="flex items-center justify-between rounded border border-slate-200 p-3 text-sm">
                      <div>
                        <p className="font-semibold">{supplier.name}</p>
                        <p className="text-slate-500">{supplier.email}{supplier.city ? ` · ${supplier.city}` : ''}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingSupplier(supplier)} className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">Modifier</button>
                        <button onClick={() => handleDeleteSupplier(supplier.id)} className="rounded bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700">Supprimer</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
                <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Créer site</button>
              </form>

              <div className="space-y-2">
                {locations.map((location) => (
                  <div key={location.id} className="flex items-center justify-between rounded border border-slate-200 p-3 text-sm">
                    <div>
                      <p className="font-semibold">{location.name}</p>
                      <p className="text-slate-600">{location.address}, {location.city} {location.postalCode}</p>
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

          {activeSection === 'assignments' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Affecter un quai à un fournisseur</h2>
              <form onSubmit={handleAssignQuay} className="grid gap-3 sm:grid-cols-2">
                <select className="rounded border p-2" required value={assignmentForm.supplierId} onChange={(e) => setAssignmentForm((prev) => ({ ...prev, supplierId: e.target.value }))}>
                  <option value="">Selectionner un fournisseur</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
                <select className="rounded border p-2" required value={assignmentForm.quayId} onChange={(e) => setAssignmentForm((prev) => ({ ...prev, quayId: e.target.value }))}>
                  <option value="">Selectionner un quai</option>
                  {allQuays.map((quay) => (
                    <option key={quay.id} value={quay.id}>{quay.name} ({quay.locationName})</option>
                  ))}
                </select>
                <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Créer affectation</button>
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
                  <select className="rounded border p-2 sm:col-span-2" value={appointmentForm.locationId} onChange={(e) => setAppointmentForm((prev) => ({ ...prev, locationId: e.target.value }))}>
                    <option value="">Site (optionnel)</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
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
        </main>
      </div>
    </div>
  );
}
