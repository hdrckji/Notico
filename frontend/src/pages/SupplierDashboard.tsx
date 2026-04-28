import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import client from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function SupplierDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const { logout } = useAuthStore();

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      const { data } = await client.get('/appointments');
      setAppointments(data);
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">My Appointments</h1>
          <button
            onClick={logout}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Logout
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4">
        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <div className="grid gap-4">
            {appointments.length === 0 ? (
              <div className="bg-white p-6 rounded shadow text-center text-gray-600">
                No appointments yet
              </div>
            ) : (
              appointments.map((apt: any) => (
                <div key={apt.id} className="bg-white p-4 rounded shadow">
                  <h3 className="font-semibold">{apt.orderNumber}</h3>
                  <p className="text-gray-600">Volume: {apt.volume} {apt.deliveryType}</p>
                  <p className="text-gray-600">Date: {new Date(apt.scheduledDate).toLocaleDateString()}</p>
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
        )}
      </main>
    </div>
  );
}
