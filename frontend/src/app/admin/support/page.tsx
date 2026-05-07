'use client';
import { useState, useEffect } from 'react';
import { supportAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { format } from 'date-fns';

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { loadTickets(); }, []);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const { data } = await supportAPI.getAdminTickets();
      setTickets(data);
    } catch { toast.error('Failed to load tickets'); }
    finally { setLoading(false); }
  };

  const updateTicket = async (id: string, status: string) => {
    try {
      await supportAPI.updateTicket(id, { status });
      toast.success('Ticket updated');
      loadTickets();
    } catch { toast.error('Failed to update ticket'); }
  };

  const filtered = filter ? tickets.filter(t => t.status === filter) : tickets;

  const statusColors: Record<string, string> = {
    open: 'badge-ended',
    in_progress: 'badge-draft',
    resolved: 'badge-active',
    closed: ''
  };

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-primary-500" style={{ fontFamily: 'var(--font-orbitron)' }}>
            Support Tickets
          </h1>
          <p className="text-dark-800 text-sm mt-1">Manage student support requests</p>
        </div>
        <button onClick={loadTickets} className="btn-secondary py-2 px-4 text-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {['', 'open', 'in_progress', 'resolved'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`py-1.5 px-4 rounded-full text-xs font-semibold transition-all ${filter === s
              ? 'bg-primary-500 text-black'
              : 'bg-dark-300 text-dark-800 hover:bg-dark-500'
            }`}>
            {s ? s.replace('_', ' ').toUpperCase() : 'ALL'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="card-glow p-12 text-center">
          <p className="text-dark-700">No support tickets</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(ticket => (
            <div key={ticket.id} className="card-glow p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold text-white">{ticket.subject}</span>
                    <span className={`badge text-xs ${statusColors[ticket.status] || ''}`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-dark-700 mb-2">
                    {ticket.student_name} · {ticket.reference_number} · {ticket.category}
                    · {format(new Date(ticket.created_at), 'MMM d, HH:mm')}
                  </p>
                  <p className="text-sm text-dark-800">{ticket.description}</p>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  {ticket.status === 'open' && (
                    <button onClick={() => updateTicket(ticket.id, 'in_progress')} className="btn-secondary py-1.5 px-3 text-xs">
                      Start
                    </button>
                  )}
                  {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                    <button onClick={() => updateTicket(ticket.id, 'resolved')} className="btn-primary py-1.5 px-3 text-xs">
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
