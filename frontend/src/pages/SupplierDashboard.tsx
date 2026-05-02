import { useEffect, useState } from 'react';
import client from '../services/api';
import { useAuthStore } from '../store/authStore';

interface Appointment {
  id: string;
  orderNumber: string;
  volume: number;
  deliveryType: 'PALLET' | 'PARCEL';
  deliveryNoteFileName?: string | null;
  deliveryNoteFileMimeType?: string | null;
  deliveryNoteFileBase64?: string | null;
  scheduledDate: string;
  status: string;
  location?: { name: string };
  quay?: { name: string };
}

interface DeliveryLocation {
  id: string;
  name: string;
  orderPrefix?: string | null;
}

interface AvailableSlot {
  scheduledDate: string;
  dateLabel: string;
  quayId: string;
  quayName: string;
  locationId: string;
  locationName: string;
  remainingCapacity: number;
}

export default function SupplierDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [locations, setLocations] = useState<DeliveryLocation[]>([]);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [findingSlots, setFindingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deliveryNoteFile, setDeliveryNoteFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resolvedLocation, setResolvedLocation] = useState<DeliveryLocation | null>(null);
  const [bookingForm, setBookingForm] = useState({
    orderNumber: '',
    volume: 1,
    deliveryType: 'PALLET' as 'PALLET' | 'PARCEL',
  });
  const { logout } = useAuthStore();

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [appointmentsResponse, locationsResponse] = await Promise.all([
        client.get('/appointments'),
        client.get('/locations'),
      ]);
      setAppointments(appointmentsResponse.data || []);
      const locationsData = (locationsResponse.data || []).map((location: any) => ({
        id: location.id,
        name: location.name,
        orderPrefix: location.orderPrefix || null,
      }));
      setLocations(locationsData);
    } catch (loadError) {
      console.error('Failed to load supplier data:', loadError);
      setError('Impossible de charger vos donnees.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAppointments = async () => {
    try {
      const { data } = await client.get('/appointments');
      setAppointments(data);
    } catch (fetchError) {
      console.error('Failed to fetch appointments:', fetchError);
    }
  };

  const resolveLocationByOrderNumber = (orderNumber: string) => {
    const prefix = orderNumber.trim().slice(0, 5);
    if (!/^\d{5}$/.test(prefix)) {
      return null;
    }
    return locations.find((location) => location.orderPrefix === prefix) || null;
  };

  const handleFindSlots = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSelectedSlot(null);

    const inferredLocation = resolveLocationByOrderNumber(bookingForm.orderNumber);
    setResolvedLocation(inferredLocation);

    if (!inferredLocation) {
      setError('Aucun site ne correspond aux 5 premiers chiffres de ce numero de commande.');
      return;
    }

    if (bookingForm.volume <= 0) {
      setError('Indiquez un volume valide.');
      return;
    }

    try {
      setFindingSlots(true);
      const { data } = await client.get('/appointments/available-slots', {
        params: {
          orderNumber: bookingForm.orderNumber.trim(),
          locationId: inferredLocation.id,
          deliveryType: bookingForm.deliveryType,
          volume: bookingForm.volume,
        },
      });
      setAvailableSlots(data || []);
      if (!data || data.length === 0) {
        setMessage('Aucun creneau disponible pour le moment.');
      }
    } catch (slotError: any) {
      setError(slotError.response?.data?.error || 'Impossible de calculer les creneaux.');
      setAvailableSlots([]);
    } finally {
      setFindingSlots(false);
    }
  };

  const handleCreateAppointment = async () => {
    setError('');
    setMessage('');

    if (!selectedSlot) {
      setError('Selectionnez un creneau propose.');
      return;
    }

    if (!bookingForm.orderNumber.trim()) {
      setError('Le numero de commande est obligatoire.');
      return;
    }

    try {
      setSaving(true);
      const createResponse = await client.post('/appointments', {
        orderNumber: bookingForm.orderNumber.trim(),
        volume: bookingForm.volume,
        deliveryType: bookingForm.deliveryType,
        locationId: selectedSlot.locationId,
        quayId: selectedSlot.quayId,
        scheduledDate: selectedSlot.scheduledDate,
      });

      if (deliveryNoteFile) {
        if (deliveryNoteFile.size > 5 * 1024 * 1024) {
          setError('Le fichier BL dépasse 5MB. Le rendez-vous a bien été créé sans fichier.');
        } else {
          try {
            const base64Content = await fileToBase64(deliveryNoteFile);
            await client.patch(`/appointments/${createResponse.data.id}/delivery-note`, {
              fileName: deliveryNoteFile.name,
              mimeType: deliveryNoteFile.type || 'application/octet-stream',
              base64Content,
            });
          } catch (uploadError: any) {
            setError(uploadError.response?.data?.error || 'Rendez-vous créé, mais upload du BL impossible.');
          }
        }
      }

      setMessage('Rendez-vous cree avec succes.');
      setAvailableSlots([]);
      setSelectedSlot(null);
      setResolvedLocation(null);
      setDeliveryNoteFile(null);
      setBookingForm((prev) => ({ ...prev, orderNumber: '' }));
      await fetchAppointments();
    } catch (saveError: any) {
      setError(saveError.response?.data?.error || 'Creation du rendez-vous impossible.');
    } finally {
      setSaving(false);
    }
  };

  const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const marker = 'base64,';
      const idx = result.indexOf(marker);
      if (idx === -1) {
        reject(new Error('Format de fichier invalide.'));
        return;
      }
      resolve(result.slice(idx + marker.length));
    };
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Espace fournisseur</h1>
          <button
            onClick={logout}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Deconnexion
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {loading ? (
          <div className="text-center py-12">Chargement...</div>
        ) : (
          <>
            <section className="bg-white rounded-xl shadow p-5 space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Demande de livraison</h2>
                <p className="text-sm text-gray-600">Indiquez le numero de commande et le volume pour recevoir les prochains creneaux disponibles.</p>
              </div>

              {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              {message && <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

              <form onSubmit={handleFindSlots} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input
                  className="rounded border p-2"
                  placeholder="Numero de commande"
                  value={bookingForm.orderNumber}
                  onChange={(e) => {
                    const nextOrderNumber = e.target.value;
                    setBookingForm((prev) => ({ ...prev, orderNumber: nextOrderNumber }));
                    setResolvedLocation(resolveLocationByOrderNumber(nextOrderNumber));
                    setAvailableSlots([]);
                    setSelectedSlot(null);
                    setError('');
                    setMessage('');
                  }}
                  required
                />

                <div className="rounded border p-2 text-sm text-slate-700 bg-slate-50">
                  {resolvedLocation
                    ? `Site detecte automatiquement: ${resolvedLocation.name}`
                    : 'Site detecte automatiquement selon les 5 premiers chiffres du numero de commande'}
                </div>

                <select
                  className="rounded border p-2"
                  value={bookingForm.deliveryType}
                  onChange={(e) => setBookingForm((prev) => ({ ...prev, deliveryType: e.target.value as 'PALLET' | 'PARCEL' }))}
                >
                  <option value="PALLET">Palettes</option>
                  <option value="PARCEL">Colis</option>
                </select>

                <input
                  className="rounded border p-2"
                  type="number"
                  min={1}
                  value={bookingForm.volume}
                  onChange={(e) => setBookingForm((prev) => ({ ...prev, volume: Math.max(1, Number(e.target.value) || 1) }))}
                  required
                />

                <div className="sm:col-span-2 lg:col-span-4 rounded border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Bon de livraison (optionnel)</p>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    className="text-sm"
                    onChange={(e) => setDeliveryNoteFile(e.target.files?.[0] || null)}
                  />
                  {deliveryNoteFile && (
                    <p className="mt-1 text-xs text-slate-600">Fichier sélectionné: {deliveryNoteFile.name}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={findingSlots}
                  className="sm:col-span-2 lg:col-span-4 rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {findingSlots ? 'Recherche en cours...' : 'Proposer les prochains creneaux'}
                </button>
              </form>

              {availableSlots.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Creneaux proposes</h3>
                  <div className="grid gap-2 md:grid-cols-2">
                    {availableSlots.map((slot) => {
                      const isSelected = selectedSlot?.scheduledDate === slot.scheduledDate && selectedSlot?.quayId === slot.quayId;
                      return (
                        <button
                          key={`${slot.quayId}-${slot.scheduledDate}`}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`rounded border p-3 text-left transition ${
                            isSelected
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white hover:border-slate-400'
                          }`}
                        >
                          <p className="font-semibold">{slot.dateLabel}</p>
                          <p className={`text-sm ${isSelected ? 'text-slate-100' : 'text-slate-600'}`}>{slot.locationName} · {slot.quayName}</p>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={handleCreateAppointment}
                    disabled={!selectedSlot || saving}
                    className="rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving ? 'Creation...' : 'Confirmer ce creneau'}
                  </button>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-gray-900">Mes rendez-vous</h2>
              <div className="grid gap-3">
                {appointments.length === 0 ? (
                  <div className="bg-white p-6 rounded shadow text-center text-gray-600">
                    Aucun rendez-vous pour le moment.
                  </div>
                ) : (
                  appointments.map((apt) => (
                    <div key={apt.id} className="bg-white p-4 rounded shadow">
                      <h3 className="font-semibold">Commande {apt.orderNumber}</h3>
                      <p className="text-gray-600">Volume: {apt.volume} {apt.deliveryType === 'PALLET' ? 'palette(s)' : 'colis'}</p>
                      <p className="text-gray-600">Site: {apt.location?.name || '-'}</p>
                      <p className="text-gray-600">Quai: {apt.quay?.name || '-'}</p>
                      <p className="text-gray-600">Date: {new Date(apt.scheduledDate).toLocaleString('fr-BE')}</p>
                      {apt.deliveryNoteFileName ? (
                        <p className="text-gray-600">
                          BL fichier:{' '}
                          <a
                            className="text-blue-700 underline"
                            href={`data:${apt.deliveryNoteFileMimeType || 'application/octet-stream'};base64,${apt.deliveryNoteFileBase64 || ''}`}
                            download={apt.deliveryNoteFileName}
                          >
                            {apt.deliveryNoteFileName}
                          </a>
                        </p>
                      ) : (
                        <p className="text-gray-500 text-sm">Aucun fichier BL lié.</p>
                      )}

                      <span className={`inline-block mt-2 px-3 py-1 rounded text-sm font-medium ${
                        apt.status === 'DELIVERED' ? 'bg-green-100 text-green-800' :
                        apt.status === 'NO_SHOW' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {apt.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
