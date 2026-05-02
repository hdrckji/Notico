import { useEffect, useState } from 'react';
import client from '../services/api';
import { useAuthStore } from '../store/authStore';
import { type Lang, LANG_LABELS, t, getStoredLang, setStoredLang } from '../i18n/supplier';

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
  const [lang, setLang] = useState<Lang>(getStoredLang);
  const [bookingForm, setBookingForm] = useState({
    orderNumber: '',
    volume: 1,
    deliveryType: 'PALLET' as 'PALLET' | 'PARCEL',
  });
  const { logout } = useAuthStore();

  const tr = t[lang];

  const switchLang = (next: Lang) => {
    setLang(next);
    setStoredLang(next);
  };

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
      setError(t[lang].errLoadData);
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
      setError(tr.errNoSite);
      return;
    }

    if (bookingForm.volume <= 0) {
      setError(tr.errInvalidVolume);
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
        setMessage(tr.noSlotsAvailable);
      }
    } catch (slotError: any) {
      setError(slotError.response?.data?.error || tr.errNoSlots);
      setAvailableSlots([]);
    } finally {
      setFindingSlots(false);
    }
  };

  const handleCreateAppointment = async () => {
    setError('');
    setMessage('');

    if (!selectedSlot) {
      setError(tr.errNoSlot);
      return;
    }

    if (!bookingForm.orderNumber.trim()) {
      setError(tr.errNoOrderNumber);
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
          setError(tr.errBlTooBig);
        } else {
          try {
            const base64Content = await fileToBase64(deliveryNoteFile);
            await client.patch(`/appointments/${createResponse.data.id}/delivery-note`, {
              fileName: deliveryNoteFile.name,
              mimeType: deliveryNoteFile.type || 'application/octet-stream',
              base64Content,
            });
          } catch (uploadError: any) {
            setError(uploadError.response?.data?.error || tr.errBlUpload);
          }
        }
      }

      setMessage(tr.successAppt);
      setAvailableSlots([]);
      setSelectedSlot(null);
      setResolvedLocation(null);
      setDeliveryNoteFile(null);
      setBookingForm((prev) => ({ ...prev, orderNumber: '' }));
      await fetchAppointments();
    } catch (saveError: any) {
      setError(saveError.response?.data?.error || tr.errCreateAppt);
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
          <h1 className="text-2xl font-bold text-gray-900">{tr.supplierSpace}</h1>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => switchLang(l)}
                  className={`rounded px-2 py-0.5 text-xs font-bold border ${lang === l ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`}
                >
                  {LANG_LABELS[l]}
                </button>
              ))}
            </div>
            <button
              onClick={logout}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              {tr.logout}
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {loading ? (
          <div className="text-center py-12">{tr.loading}</div>
        ) : (
          <>
            <section className="bg-white rounded-xl shadow p-5 space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{tr.deliveryRequestTitle}</h2>
                <p className="text-sm text-gray-600">{tr.deliveryRequestSubtitle}</p>
              </div>

              {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              {message && <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

              <form onSubmit={handleFindSlots} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input
                  className="rounded border p-2"
                  placeholder={tr.orderNumber}
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
                    ? `${tr.siteDetected}: ${resolvedLocation.name}`
                    : tr.siteAuto}
                </div>

                <select
                  className="rounded border p-2"
                  value={bookingForm.deliveryType}
                  onChange={(e) => setBookingForm((prev) => ({ ...prev, deliveryType: e.target.value as 'PALLET' | 'PARCEL' }))}
                >
                  <option value="PALLET">{tr.pallets}</option>
                  <option value="PARCEL">{tr.parcels}</option>
                </select>

                <input
                  className="rounded border p-2"
                  type="number"
                  min={1}
                  placeholder={tr.volumeLabel}
                  value={bookingForm.volume}
                  onChange={(e) => setBookingForm((prev) => ({ ...prev, volume: Math.max(1, Number(e.target.value) || 1) }))}
                  required
                />

                <div className="sm:col-span-2 lg:col-span-4 rounded border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{tr.blFileLabel}</p>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    className="text-sm"
                    onChange={(e) => setDeliveryNoteFile(e.target.files?.[0] || null)}
                  />
                  {deliveryNoteFile && (
                    <p className="mt-1 text-xs text-slate-600">{tr.selectedFile}: {deliveryNoteFile.name}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={findingSlots}
                  className="sm:col-span-2 lg:col-span-4 rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {findingSlots ? tr.findingSlots : tr.findSlots}
                </button>
              </form>

              {availableSlots.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{tr.proposedSlots}</h3>
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
                    {saving ? tr.confirming : tr.confirmSlot}
                  </button>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-gray-900">{tr.myAppointments}</h2>
              <div className="grid gap-3">
                {appointments.length === 0 ? (
                  <div className="bg-white p-6 rounded shadow text-center text-gray-600">
                    {tr.noAppointments}
                  </div>
                ) : (
                  appointments.map((apt) => (
                    <div key={apt.id} className="bg-white p-4 rounded shadow">
                      <h3 className="font-semibold">{tr.order} {apt.orderNumber}</h3>
                      <p className="text-gray-600">{tr.volume}: {apt.volume} {apt.deliveryType === 'PALLET' ? tr.palette : tr.parcel}</p>
                      <p className="text-gray-600">{tr.site}: {apt.location?.name || '-'}</p>
                      <p className="text-gray-600">{tr.quay}: {apt.quay?.name || '-'}</p>
                      <p className="text-gray-600">{tr.date}: {new Date(apt.scheduledDate).toLocaleString('fr-BE')}</p>
                      {apt.deliveryNoteFileName ? (
                        <p className="text-gray-600">
                          {tr.blFile}:{' '}
                          <a
                            className="text-blue-700 underline"
                            href={`data:${apt.deliveryNoteFileMimeType || 'application/octet-stream'};base64,${apt.deliveryNoteFileBase64 || ''}`}
                            download={apt.deliveryNoteFileName}
                          >
                            {apt.deliveryNoteFileName}
                          </a>
                        </p>
                      ) : (
                        <p className="text-gray-500 text-sm">{tr.noBlFile}</p>
                      )}

                      <span className={`inline-block mt-2 px-3 py-1 rounded text-sm font-medium ${
                        apt.status === 'DELIVERED' ? 'bg-green-100 text-green-800' :
                        apt.status === 'NO_SHOW' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {tr[`status_${apt.status}` as keyof typeof tr] || apt.status}
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
