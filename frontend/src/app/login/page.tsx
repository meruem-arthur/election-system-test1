'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Zap, Shield, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function StudentLoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ referenceNumber: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.referenceNumber || !form.password) {
      return toast.error('Please fill in all fields');
    }

    setLoading(true);
    try {
      const { data } = await authAPI.studentLogin(form.referenceNumber.trim(), form.password);

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.student));
      localStorage.setItem('userType', 'student');

      if (data.requiresPasswordChange) {
        router.push('/student/change-password');
      } else if (data.requiresOtpVerification) {
        router.push('/student/verify-otp');
      } else {
        router.push('/student/vote');
      }

      toast.success(`Welcome, ${data.student.fullName.split(' ')[0]}!`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="absolute inset-0 bg-glow-radial opacity-20" />
      <div className="scan-overlay" />

      {/* Corner decorations */}
      <div className="absolute top-0 left-0 w-32 h-32 border-l-2 border-t-2 border-primary-500/20" />
      <div className="absolute bottom-0 right-0 w-32 h-32 border-r-2 border-b-2 border-primary-500/20" />

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 relative"
            style={{ background: 'linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,255,136,0.05))', border: '1px solid rgba(0,255,136,0.3)' }}>
            <Zap className="w-8 h-8" style={{ color: '#00ff88' }} />
            <div className="absolute inset-0 rounded-2xl animate-pulse-glow" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-widest" style={{ fontFamily: 'var(--font-orbitron)', color: '#00ff88' }}>
            Smart Election
          </h1>
          <p className="text-dark-800 text-sm mt-2" style={{ fontFamily: 'var(--font-syne)' }}>
            Departmental Election System
          </p>
        </div>

        {/* Card */}
        <div className="card-glow p-8">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-4 h-4 text-primary-500" />
            <span className="text-xs uppercase tracking-widest text-dark-800">Secure Student Portal</span>
          </div>

          <h2 className="text-xl font-bold text-white mb-1">Sign In to Vote</h2>
          <p className="text-dark-800 text-sm mb-8">Use your official student reference number</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="label">Reference Number</label>
              <input
                type="text"
                className="input font-mono tracking-widest"
                placeholder="e.g. 9013200723"
                value={form.referenceNumber}
                onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))}
                autoComplete="username"
                maxLength={20}
              />
              <p className="text-xs text-dark-700 mt-1">Your official student reference number</p>
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-12"
                  placeholder="First time? Use Surname + last 4 digits"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-700 hover:text-white transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* First login hint */}
            <div className="rounded-xl p-3" style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.1)' }}>
              <p className="text-xs text-dark-800">
                <span style={{ color: '#00ff88' }}>First time?</span> Use your <strong className="text-white">Surname + last 4 digits</strong> of your reference number.
                <br/>
                <span className="text-dark-700">Example: Mensah0723</span>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2"
            >
              {loading ? (
                <div className="spinner" />
              ) : (
                <>
                  Access Voting Portal
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <hr className="divider" />

          <p className="text-center text-sm text-dark-800">
            Having trouble?{' '}
            <Link href="/student/support" className="text-primary-500 hover:underline">
              Contact Support
            </Link>
          </p>
        </div>

        {/* Admin link */}
        <p className="text-center mt-6 text-xs text-dark-700">
          <Link href="/admin/login" className="hover:text-primary-500 transition-colors">
            Administration Portal →
          </Link>
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
