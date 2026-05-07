'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Shield, Zap } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authAPI.adminLogin(form.email, form.password);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.admin));
      localStorage.setItem('userType', 'admin');
      toast.success(`Welcome, ${data.admin.fullName}`);
      router.push('/admin/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="scan-overlay" />

      {/* Corner accents */}
      <div className="absolute top-0 right-0 w-48 h-48 border-r-2 border-t-2 border-primary-500/10" />
      <div className="absolute bottom-0 left-0 w-48 h-48 border-l-2 border-b-2 border-primary-500/10" />

      <div className="w-full max-w-sm relative z-10 animate-fade-in">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-5"
            style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.25)' }}>
            <Shield className="w-7 h-7 text-primary-500" />
          </div>
          <h1 className="text-xl font-black uppercase tracking-widest text-primary-500" style={{ fontFamily: 'var(--font-orbitron)' }}>
            Admin Portal
          </h1>
          <p className="text-dark-800 text-xs mt-1">Authorized personnel only</p>
        </div>

        <div className="card-glow p-7">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="label">Email Address</label>
              <input
                type="email"
                className="input"
                placeholder="admin@election.edu.gh"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                autoComplete="email"
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-12"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-700 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? <div className="spinner" /> : 'Access Admin Panel'}
            </button>
          </form>

          <p className="text-center text-xs text-dark-700 mt-5">
            <a href="/admin/forgot-password" className="hover:text-primary-500 transition-colors">
              Forgot password?
            </a>
          </p>
        </div>

        <p className="text-center mt-6 text-xs text-dark-700">
          <a href="/login" className="hover:text-primary-500 transition-colors">← Student Voting Portal</a>
        </p>

        {/* Developer credit */}
        <p className="text-center mt-4 text-xs" style={{ color: '#333' }}>
          Developed by{' '}
          <span style={{ color: '#00ff88', opacity: 0.6 }}>LIL PEE</span>
          {' '}&amp;{' '}
          <span style={{ color: '#00ff88', opacity: 0.6 }}>CK442</span>
        </p>
      </div>
    </div>
  );
}
