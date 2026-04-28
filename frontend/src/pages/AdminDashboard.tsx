import { FormEvent, useEffect, useMemo, useState } from 'react';
import client from '../services/api';
import { useAuthStore } from '../store/authStore';

type AdminSection = 'overview' | 'suppliers' | 'users' | 'locations' | 'quays' | 'assignments';

interface Supplier {
  id: string;
  name: string;
  email: string;
  city: string;
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
  const [locations, setLocations] = useState<Location[]>([]);

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
      const [suppliersResponse, locationsResponse] = await Promise.all([
        client.get('/suppliers'),
        client.get('/locations'),
      ]);

      setSuppliers(suppliersResponse.data || []);
      setLocations(locationsResponse.data || []);
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
      });
      setMessage('Utilisateur interne cree avec succes.');
      setUserForm({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        role: 'EMPLOYEE',
        locationId: '',
      });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Creation de l utilisateur impossible.');
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
            <p className="text-sm text-slate-600">Bienvenue {user?.firstName || 'Admin'}, gerez votre operation Notico.</p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Deconnexion
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
              <h2 className="text-xl font-bold">Vue generale</h2>
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
                Rafraichir les donnees
              </button>
            </div>
          )}

          {activeSection === 'suppliers' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Creer un fournisseur</h2>
              <form onSubmit={handleCreateSupplier} className="grid gap-3 sm:grid-cols-2">
                <input className="rounded border p-2" placeholder="Nom" required value={supplierForm.name} onChange={(e) => setSupplierForm((prev) => ({ ...prev, name: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Identifiant / Email" required type="text" value={supplierForm.email} onChange={(e) => setSupplierForm((prev) => ({ ...prev, email: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Telephone" required value={supplierForm.phone} onChange={(e) => setSupplierForm((prev) => ({ ...prev, phone: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Contact" value={supplierForm.contact} onChange={(e) => setSupplierForm((prev) => ({ ...prev, contact: e.target.value }))} />
                <input className="rounded border p-2 sm:col-span-2" placeholder="Adresse" value={supplierForm.address} onChange={(e) => setSupplierForm((prev) => ({ ...prev, address: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Code postal" value={supplierForm.postalCode} onChange={(e) => setSupplierForm((prev) => ({ ...prev, postalCode: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Ville" value={supplierForm.city} onChange={(e) => setSupplierForm((prev) => ({ ...prev, city: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Volume max/jour" type="number" min={1} value={supplierForm.maxDailyVolume} onChange={(e) => setSupplierForm((prev) => ({ ...prev, maxDailyVolume: Number(e.target.value) || 1 }))} />
                <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Creer fournisseur</button>
              </form>

              <div>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Fournisseurs existants</h3>
                <div className="space-y-2">
                  {suppliers.map((supplier) => (
                    <div key={supplier.id} className="rounded border border-slate-200 p-3 text-sm">
                      <p className="font-semibold">{supplier.name}</p>
                      <p className="text-slate-600">{supplier.email} - {supplier.city || 'Ville non definie'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'users' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Creer un utilisateur interne</h2>
              <form onSubmit={handleCreateUser} className="grid gap-3 sm:grid-cols-2">
                <input className="rounded border p-2" placeholder="Identifiant" type="text" required value={userForm.email} onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Mot de passe" type="password" required minLength={6} value={userForm.password} onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Prenom" required value={userForm.firstName} onChange={(e) => setUserForm((prev) => ({ ...prev, firstName: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Nom" value={userForm.lastName} onChange={(e) => setUserForm((prev) => ({ ...prev, lastName: e.target.value }))} />
                <select className="rounded border p-2" value={userForm.role} onChange={(e) => setUserForm((prev) => ({ ...prev, role: e.target.value }))}>
                  <option value="EMPLOYEE">Employe</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <select className="rounded border p-2" value={userForm.locationId} onChange={(e) => setUserForm((prev) => ({ ...prev, locationId: e.target.value }))}>
                  <option value="">Sans site</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
                <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Creer utilisateur</button>
              </form>
            </div>
          )}

          {activeSection === 'locations' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Creer un site</h2>
              <form onSubmit={handleCreateLocation} className="grid gap-3 sm:grid-cols-2">
                <input className="rounded border p-2" placeholder="Nom du site" required value={locationForm.name} onChange={(e) => setLocationForm((prev) => ({ ...prev, name: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Adresse" required value={locationForm.address} onChange={(e) => setLocationForm((prev) => ({ ...prev, address: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Ville" required value={locationForm.city} onChange={(e) => setLocationForm((prev) => ({ ...prev, city: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Code postal" required value={locationForm.postalCode} onChange={(e) => setLocationForm((prev) => ({ ...prev, postalCode: e.target.value }))} />
                <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Creer site</button>
              </form>

              <div className="space-y-2">
                {locations.map((location) => (
                  <div key={location.id} className="rounded border border-slate-200 p-3 text-sm">
                    <p className="font-semibold">{location.name}</p>
                    <p className="text-slate-600">{location.city}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'quays' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Creer un quai</h2>
              <form onSubmit={handleCreateQuay} className="grid gap-3 sm:grid-cols-2">
                <input className="rounded border p-2" placeholder="Nom du quai" required value={quayForm.name} onChange={(e) => setQuayForm((prev) => ({ ...prev, name: e.target.value }))} />
                <select className="rounded border p-2" required value={quayForm.locationId} onChange={(e) => setQuayForm((prev) => ({ ...prev, locationId: e.target.value }))}>
                  <option value="">Selectionner un site</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
                <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Creer quai</button>
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
              <h2 className="text-xl font-bold">Affecter un quai a un fournisseur</h2>
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
                <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">Creer affectation</button>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
