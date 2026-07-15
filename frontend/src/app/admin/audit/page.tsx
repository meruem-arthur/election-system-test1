'use client';
import { useState, useEffect } from 'react';
import { auditAPI, adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { RefreshCw, Shield, Filter, Download } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { format } from 'date-fns';

const ACTION_COLORS: Record<string, string> = {
  login: 'text-blue-400',
  logout: 'text-dark-700',
  vote_cast: 'text-primary-500',
  election_started: 'text-green-400',
  election_stopped: 'text-red-400',
  csv_uploaded: 'text-yellow-400',
  candidate_added: 'text-yellow-400',
  candidate_approved: 'text-primary-500',
  results_published: 'text-purple-400',
  password_changed: 'text-blue-400',
  otp_verified: 'text-primary-500',
  suspicious_login: 'text-red-500',
  vote_attempt_duplicate: 'text-red-400',
};

// Default view is the last 7 days, not "everything since the beginning" —
// the full history is always one click away by widening the range, but
// nobody should have to scroll past months of entries just to see today.
const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
const defaultFrom = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return toDateInput(d);
};

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [elections, setElections] = useState<any[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [dateFrom, setDateFrom] = useState(defaultFrom());
  const [dateTo, setDateTo] = useState(toDateInput(new Date()));
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    adminAPI.getElections().then(({ data }) => {
      setElections(data);
      if (data.length > 0) setSelectedElectionId(data[data.length - 1].id);
    });
  }, []);

  useEffect(() => {
    loadLogs();
  }, [selectedElectionId, filterAction, dateFrom, dateTo]);

  const buildParams = () => ({
    electionId: selectedElectionId || undefined,
    action: filterAction || undefined,
    from: dateFrom || undefined,
    to: dateTo || undefined,
  });

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data } = await auditAPI.getLogs({ ...buildParams(), limit: 200 });
      setLogs(data);
    } catch { toast.error('Failed to load audit logs'); }
    finally { setLoading(false); }
  };

  const clearDateRange = () => {
    setDateFrom('');
    setDateTo('');
  };

  const exportCSV = async () => {
    setExporting(true);
    try {
      const { data } = await auditAPI.exportCSV(buildParams());
      const blob = new Blob([data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${toDateInput(new Date())}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error('Failed to export audit log'); }
    finally { setExporting(false); }
  };

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-primary-500" style={{ fontFamily: 'var(--font-orbitron)' }}>
            Audit Logs
          </h1>
          <p className="text-dark-800 text-sm mt-1">Complete activity trail for transparency</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} disabled={exporting} className="btn-secondary py-2 px-4 text-sm">
            <Download className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} /> {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button onClick={loadLogs} className="btn-secondary py-2 px-4 text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select value={selectedElectionId} onChange={e => setSelectedElectionId(e.target.value)} className="input py-2 text-sm" style={{ width: 'auto' }}>
          <option value="">All Elections</option>
          {elections.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="input py-2 text-sm" style={{ width: 'auto' }}>
          <option value="">All Actions</option>
          <option value="vote_cast">Votes Cast</option>
          <option value="login">Logins</option>
          <option value="election_started">Election Started</option>
          <option value="election_stopped">Election Stopped</option>
          <option value="csv_uploaded">CSV Uploads</option>
          <option value="suspicious_login">Suspicious Logins</option>
          <option value="vote_attempt_duplicate">Duplicate Vote Attempts</option>
        </select>
        <div className="flex items-center gap-2">
          <span className="text-xs text-dark-700">From</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input py-2 text-sm" style={{ width: 'auto' }} />
          <span className="text-xs text-dark-700">To</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input py-2 text-sm" style={{ width: 'auto' }} />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={clearDateRange} className="text-xs text-primary-500 underline">
            View full history
          </button>
        )}
      </div>

      <div className="card-glow overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-dark-500">
          <div className="flex items-center gap-2 text-sm text-dark-700">
            <Shield className="w-4 h-4 text-primary-500" />
            {logs.length} log entries
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Type</th>
                <th>Details</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-dark-700">Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-dark-700">No logs found</td></tr>
              ) : logs.map(log => (
                <tr key={log.id}>
                  <td>
                    <span className="font-mono text-xs text-dark-700">
                      {format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
                    </span>
                  </td>
                  <td>
                    <span className={`text-xs font-semibold ${ACTION_COLORS[log.action] || 'text-white'}`}>
                      {log.action.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span className="text-sm text-white">{log.actor_email || log.actor_id?.slice(0, 8) + '...'}</span>
                  </td>
                  <td>
                    <span className={`badge text-xs ${log.actor_type === 'admin' ? 'badge-published' : 'badge-active'}`}>
                      {log.actor_type}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs text-dark-700 font-mono">
                      {Object.entries(log.metadata || {}).map(([k, v]) => `${k}: ${v}`).join(' · ').slice(0, 60)}
                    </span>
                  </td>
                  <td>
                    <span className="font-mono text-xs text-dark-700">{log.ip_address}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
