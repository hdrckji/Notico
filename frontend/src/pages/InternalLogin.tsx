import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import client from '../services/api';

export default function InternalLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data } = await client.post('/auth/internal/login', { email, password });
      login(data.token, { ...data.user, role: data.user.role });
      if (data.user.role === 'ADMIN') navigate('/admin');
      else navigate('/employee');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">N</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Notico</h1>
        </div>
        <p className="text-gray-500 mb-6">Portail interne — Employés &amp; Admins</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 font-medium mb-2 text-sm">Identifiant</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-sm"
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 font-medium mb-2 text-sm">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-800 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-gray-100 text-center">
          <a href="/supplier/login" className="text-sm text-blue-600 hover:underline">
            Portail Fournisseur →
          </a>
        </div>
      </div>
    </div>
  );
}
