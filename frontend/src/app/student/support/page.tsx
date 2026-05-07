'use client';
import { useState, useEffect } from 'react';
import { supportAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { HelpCircle, Send, ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

const CATEGORIES = [
  'Login Issue',
  'OTP Not Received',
  'Account Locked',
  'Password Reset',
  'Technical Error',
  'Vote Not Submitted',
  'Other'
];

export default function StudentSupportPage() {
  const router = useRouter();
  const [form, setForm] = useState({ category: '', subject: '', description: '' });
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isLoggedIn = typeof window !== 'undefined' && !!localStorage.getItem('token');

  useEffect(() => {
    if (isLoggedIn) {
      supportAPI.getMyTickets().then(({ data }) => setTickets(data)).catch(() => {});
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category || !form.subject || !form.description) {
      return toast.error('Please fill in all fields');
    }
    setLoading(true);
    try {
      await supportAPI.createTicket(form);
      toast.success('Support ticket submitted');
      setSubmitted(true);
      if (isLoggedIn) {
        const { data } = await supportAPI.getMyTickets();
        setTickets(data);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit ticket');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-dark p-4 py-8">
      <div className="max-w-lg mx-auto">
        {/* Back */}
        {isLoggedIn && (
          <button onClick={() => router.back()} className="flex items-center gap-2 text-dark-700 hover:text-white text-sm mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
        )}

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4"
            style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.25)' }}>
            <HelpCircle className="w-7 h-7 text-primary-500" />
          </div>
          <h1 className="text-xl font-black uppercase tracking-widest text-white" style={{ fontFamily: 'var(--font-orbitron)' }}>
            Help & Support
          </h1>
          <p className="text-dark-800 text-sm mt-2">Having trouble? Submit a support request</p>
        </div>

        {submitted ? (
          <div className="card-glow p-8 text-center">
            <div className="text-4xl mb-4">✅</div>
            <h2 className="font-bold text-white mb-2">Ticket Submitted</h2>
            <p className="text-dark-800 text-sm mb-6">An admin will review your request and assist you shortly.</p>
            <button onClick={() => setSubmitted(false)} className="btn-secondary">Submit Another</button>
          </div>
        ) : (
          <div className="card-glow p-7">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label">Issue Category *</label>
                <select className="input" value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))} required>
                  <option value="">Select issue type...</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="label">Subject *</label>
                <input className="input" placeholder="Brief summary of your issue"
                  value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} required />
              </div>

              <div>
                <label className="label">Description *</label>
                <textarea className="input" rows={5}
                  placeholder="Describe your issue in detail. Include your reference number, what you were trying to do, and what happened..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? <div className="spinner" /> : <><Send className="w-4 h-4" /> Submit Request</>}
              </button>
            </form>
          </div>
        )}

        {/* Existing tickets */}
        {tickets.length > 0 && (
          <div className="mt-8">
            <h3 className="font-bold text-white mb-4 text-sm uppercase tracking-widest">My Tickets</h3>
            <div className="space-y-3">
              {tickets.map(t => (
                <div key={t.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white text-sm">{t.subject}</p>
                      <p className="text-xs text-dark-700 mt-0.5">{t.category}</p>
                    </div>
                    <span className={`badge text-xs flex-shrink-0 ${
                      t.status === 'resolved' ? 'badge-active' :
                      t.status === 'in_progress' ? 'badge-draft' : 'badge-ended'
                    }`}>
                      {t.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
