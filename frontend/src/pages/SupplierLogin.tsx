import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import client from '../services/api';
import { type Lang, LANG_LABELS, t, getStoredLang, setStoredLang } from '../i18n/supplier';

export default function SupplierLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<Lang>(getStoredLang);
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const tr = t[lang];

  const switchLang = (next: Lang) => {
    setLang(next);
    setStoredLang(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data } = await client.post('/auth/supplier/login', { email, password });
      login(data.token, { ...data.supplier, role: 'SUPPLIER' });
      navigate('/supplier');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="flex justify-end gap-1 mb-4">
          {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => switchLang(l)}
              className={`rounded px-2 py-0.5 text-xs font-bold border ${lang === l ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`}
            >
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{tr.portalTitle}</h1>
        <p className="text-gray-600 mb-6">{tr.portalSubtitle}</p>

        {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 font-medium mb-2">{tr.loginId}</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder=""
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 font-medium mb-2">{tr.loginPassword}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition disabled:opacity-50"
          >
            {loading ? tr.loginLoading : tr.loginButton}
          </button>
        </form>
      </div>
    </div>
  );
}
