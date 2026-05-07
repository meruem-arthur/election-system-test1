'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { ShieldCheck, RefreshCw } from 'lucide-react';

export default function VerifyOTPPage() {
  const router = useRouter();
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
    const timer = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...digits];
    newDigits[index] = value.slice(-1);
    setDigits(newDigits);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();

    // Auto-submit when all filled
    if (value && index === 5) {
      const code = [...newDigits.slice(0, 5), value.slice(-1)].join('');
      if (code.length === 6) submitCode(code);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newDigits = pasted.split('');
      setDigits(newDigits);
      submitCode(pasted);
    }
  };

  const submitCode = async (code: string) => {
    setLoading(true);
    try {
      const { data } = await authAPI.verifyOTP(code);
      if (data.token) localStorage.setItem('token', data.token);
      toast.success('Identity verified!');
      router.push('/student/vote');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid code');
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally { setLoading(false); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = digits.join('');
    if (code.length !== 6) return toast.error('Enter all 6 digits');
    submitCode(code);
  };

  const resendOTP = async () => {
    if (countdown > 0) return;
    setResending(true);
    try {
      const { data } = await authAPI.resendOTP();
      toast.success(`OTP resent to ${data.otpSentTo}`);
      setCountdown(60);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to resend OTP');
    } finally { setResending(false); }
  };

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="w-full max-w-sm relative z-10 animate-fade-in text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-6"
          style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.25)' }}>
          <ShieldCheck className="w-7 h-7 text-primary-500" />
        </div>

        <h1 className="text-xl font-black uppercase tracking-widest text-white mb-2" style={{ fontFamily: 'var(--font-orbitron)' }}>
          Verify Identity
        </h1>
        <p className="text-dark-800 text-sm mb-8">
          Enter the 6-digit code sent to your registered phone or email
        </p>

        <div className="card-glow p-7">
          <form onSubmit={handleSubmit}>
            {/* OTP input boxes */}
            <div className="flex justify-center gap-2 mb-8" onPaste={handlePaste}>
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleInput(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  className="w-12 h-14 text-center text-xl font-bold font-mono rounded-xl outline-none transition-all"
                  style={{
                    background: '#0f0f0f',
                    border: `2px solid ${digit ? '#00ff88' : '#2a2a2a'}`,
                    color: '#fff',
                    boxShadow: digit ? '0 0 8px rgba(0,255,136,0.3)' : 'none'
                  }}
                />
              ))}
            </div>

            <button type="submit" disabled={loading || digits.join('').length < 6} className="btn-primary w-full mb-4">
              {loading ? <div className="spinner" /> : 'Verify Code'}
            </button>
          </form>

          <button
            onClick={resendOTP}
            disabled={countdown > 0 || resending}
            className="w-full text-sm text-dark-700 hover:text-primary-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${resending ? 'animate-spin' : ''}`} />
            {countdown > 0 ? `Resend code in ${countdown}s` : 'Resend code'}
          </button>
        </div>

        <p className="text-xs text-dark-700 mt-6">
          Having trouble?{' '}
          <a href="/student/support" className="text-primary-500 hover:underline">Contact admin support</a>
        </p>
      </div>
    </div>
  );
}
