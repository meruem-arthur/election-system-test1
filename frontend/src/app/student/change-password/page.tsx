'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Lock, Check } from 'lucide-react';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const requirements = [
    { label: 'At least 8 characters', met: newPassword.length >= 8 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(newPassword) },
    { label: 'Lowercase letter', met: /[a-z]/.test(newPassword) },
    { label: 'Number', met: /\d/.test(newPassword) },
    { label: 'Special character (@$!%*?&)', met: /[@$!%*?&]/.test(newPassword) },
  ];
  const allMet = requirements.every(r => r.met);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allMet) return toast.error('Password does not meet requirements');
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match');

    setLoading(true);
    try {
      const { data } = await authAPI.changePassword(newPassword);

      // Update token if returned
      if (data.token) localStorage.setItem('token', data.token);

      toast.success('Password updated! OTP sent for verification.');
      router.push('/student/verify-otp');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update password');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4"
            style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.25)' }}>
            <Lock className="w-7 h-7 text-primary-500" />
          </div>
          <h1 className="text-xl font-black uppercase tracking-widest text-white" style={{ fontFamily: 'var(--font-orbitron)' }}>
            Set New Password
          </h1>
          <p className="text-dark-800 text-sm mt-2">Create a secure personal password to replace the temporary one</p>
        </div>

        <div className="card-glow p-7">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">New Password</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  className="input pr-12"
                  placeholder="Create a strong password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-700 hover:text-white">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Requirements */}
            <div className="rounded-xl p-3 space-y-1.5" style={{ background: '#0f0f0f' }}>
              {requirements.map(req => (
                <div key={req.label} className={`flex items-center gap-2 text-xs transition-colors ${req.met ? 'text-primary-500' : 'text-dark-700'}`}>
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 flex items-center justify-center ${req.met ? 'bg-primary-500' : 'bg-dark-500'}`}>
                    {req.met && <Check className="w-2 h-2 text-black" />}
                  </div>
                  {req.label}
                </div>
              ))}
            </div>

            <div>
              <label className="label">Confirm Password</label>
              <input
                type={show ? 'text' : 'password'}
                className="input"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
              {confirmPassword && confirmPassword !== newPassword && (
                <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
              )}
            </div>

            <button type="submit" disabled={loading || !allMet} className="btn-primary w-full">
              {loading ? <div className="spinner" /> : 'Set Password & Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
