'use client';
import { useState, useEffect, useRef } from 'react';
import { adminAPI, credentialDispatchAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Send, RefreshCw, Mail, MessageSquare, AlertTriangle,
  CheckCircle2, Clock, Ban, RotateCcw, Search
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';

type DispatchRow = {
  id: string;
  student_id: string;
  full_name: string;
  reference_number: string;
  school_email: string | null;
  phone_number: string | null;
  email_status: string;
  email_error: string | null;
  sms_status: string;
  sms_error: string | null;
  sms_delivery_status: string | null;
  sms_delivery_error: string | null;
  sms_delivered_at: string | null;
  blocked_no_contact: boolean;
  attempts: number;
  created_at: string;
  updated_at: string;
};

type Summary = {
  pending: number;
  delivered: number;
  failed: number;
  blockedNoContact: number;
  smsUndeliveredDespiteAccepted: number;
};

function StatusPill({ status }: { status: string | null }) {
  if (!status || status === 'pending') {
    return <span className="badge badge-draft text-xs flex items-center gap-1 w-fit"><Clock className="w-3 h-3" /> Pending</span>;
  }
  if (status === 'sent' || status === 'delivered') {
    return <span className="badge badge-active text-xs flex items-center gap-1 w-fit"><CheckCircle2 className="w-3 h-3" /> {status === 'delivered' ? 'Delivered' : 'Sent'}</span>;
  }
  if (status === 'failed' || status === 'undelivered') {
    return <span className="badge badge-ended text-xs flex items-center gap-1 w-fit"><AlertTriangle className="w-3 h-3" /> {status === 'undelivered' ? 'Undelivered' : 'Failed'}</span>;
  }
  return <span className="text-xs text-dark-700">{status}</span>;
}

export default function AdminCredentialsPage() {
  const [elections, setElections] = useState<any[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [students, setStudents] = useState<DispatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'pending' | 'failed' | 'delivered' | 'blocked'>('all');
  const [search, setSearch] = useState('');
  const [confirmSend, setConfirmSend] = useState(false);

  const selectedElectionRef = useRef('');

  useEffect(() => {
    adminAPI.getElections().then(({ data }) => {
      setElections(data);
      if (data.length > 0) {
        const latestId = data[data.length - 1].id;
        setSelectedElectionId(latestId);
        selectedElectionRef.current = latestId;
      }
    });
  }, []);

  useEffect(() => {
    selectedElectionRef.current = selectedElectionId;
    if (selectedElectionId) loadStatus(selectedElectionId);
  }, [selectedElectionId]);

  const loadStatus = async (electionId?: string) => {
    const id = electionId || selectedElectionRef.current;
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await credentialDispatchAPI.getStatus(id);
      setSummary(data.summary);
      setStudents(data.students);
      setSelected(new Set());
    } catch {
      toast.error('Failed to load credential dispatch status');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelected = (studentId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const filteredStudents = students.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'blocked') return s.blocked_no_contact;
    if (filter === 'pending') return !s.blocked_no_contact && (s.email_status === 'pending' || s.sms_status === 'pending');
    if (filter === 'failed') {
      const anyFailed = s.email_status === 'failed' || s.sms_status === 'failed';
      const anySent = s.email_status === 'sent' || s.sms_status === 'sent';
      return !s.blocked_no_contact && anyFailed && !anySent;
    }
    if (filter === 'delivered') {
      const resolved = s.email_status !== 'pending' && s.sms_status !== 'pending';
      const anySent = s.email_status === 'sent' || s.sms_status === 'sent';
      const anyFailed = s.email_status === 'failed' || s.sms_status === 'failed';
      return !s.blocked_no_contact && resolved && anySent && !(anyFailed && !anySent);
    }
    return true;
  }).filter(s => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.full_name.toLowerCase().includes(q) || s.reference_number.toLowerCase().includes(q);
  });

  const toggleSelectAllFiltered = () => {
    setSelected(prev => {
      const allSelected = filteredStudents.length > 0 && filteredStudents.every(s => prev.has(s.student_id));
      if (allSelected) return new Set();
      return new Set(filteredStudents.map(s => s.student_id));
    });
  };

  const sendCredentials = async () => {
    const id = selectedElectionRef.current;
    if (!id) return;
    setSending(true);
    try {
      const studentIds = selected.size > 0 ? Array.from(selected) : undefined;
      const { data } = await credentialDispatchAPI.regenerateBulk(id, studentIds);
      toast.success(data.message || `Queued ${data.queued} student(s)`);
      setConfirmSend(false);
      setTimeout(() => loadStatus(id), 800);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to queue credential dispatch');
    } finally {
      setSending(false);
    }
  };

  const resendFailed = async () => {
    const id = selectedElectionRef.current;
    if (!id) return;
    setResending(true);
    try {
      // If the admin has hand-picked failed rows, target just those;
      // otherwise let the backend retry everyone currently failed.
      const failedSelected = Array.from(selected).filter(sid => {
        const row = students.find(s => s.student_id === sid);
        if (!row) return false;
        const anyFailed = row.email_status === 'failed' || row.sms_status === 'failed';
        return anyFailed;
      });
      const studentIds = failedSelected.length > 0 ? failedSelected : undefined;
      const { data } = await credentialDispatchAPI.resendFailed(id, studentIds);
      toast.success(data.message || `Requeued ${data.requeued} delivery attempt(s)`);
      setTimeout(() => loadStatus(id), 800);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to requeue failed deliveries');
    } finally {
      setResending(false);
    }
  };

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-primary-500" style={{ fontFamily: 'var(--font-orbitron)' }}>
            Credential Dispatch
          </h1>
          <p className="text-dark-800 text-sm mt-1">Send login credentials and monitor email/SMS delivery status</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resendFailed}
            disabled={resending || !summary || summary.failed === 0 && !Array.from(selected).some(sid => {
              const row = students.find(s => s.student_id === sid);
              return row && (row.email_status === 'failed' || row.sms_status === 'failed');
            })}
            className="btn-secondary py-2 px-4 text-sm flex items-center gap-2"
          >
            {resending ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <RotateCcw className="w-4 h-4" />}
            Resend Failed
          </button>
          <button
            onClick={() => setConfirmSend(true)}
            disabled={sending}
            className="btn-primary py-2 px-4 text-sm flex items-center gap-2"
          >
            <Send className="w-4 h-4" /> Send / Regenerate Credentials
          </button>
        </div>
      </div>

      {/* Election selector */}
      <div className="card-glow p-4 mb-6 flex items-center gap-4">
        <label className="text-sm text-dark-700 whitespace-nowrap">Active Election:</label>
        <select
          value={selectedElectionId}
          onChange={e => setSelectedElectionId(e.target.value)}
          className="input flex-1 py-2 text-sm"
        >
          {elections.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <button onClick={() => setFilter('all')} className={`card-glow p-4 text-left transition-all ${filter === 'all' ? 'ring-1 ring-primary-500' : ''}`}>
            <p className="text-xs text-dark-700 mb-1">Total</p>
            <p className="text-2xl font-black text-white">{students.length}</p>
          </button>
          <button onClick={() => setFilter('pending')} className={`card-glow p-4 text-left transition-all ${filter === 'pending' ? 'ring-1 ring-primary-500' : ''}`}>
            <p className="text-xs text-dark-700 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</p>
            <p className="text-2xl font-black text-yellow-400">{summary.pending}</p>
          </button>
          <button onClick={() => setFilter('delivered')} className={`card-glow p-4 text-left transition-all ${filter === 'delivered' ? 'ring-1 ring-primary-500' : ''}`}>
            <p className="text-xs text-dark-700 mb-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Delivered</p>
            <p className="text-2xl font-black text-primary-500">{summary.delivered}</p>
          </button>
          <button onClick={() => setFilter('failed')} className={`card-glow p-4 text-left transition-all ${filter === 'failed' ? 'ring-1 ring-primary-500' : ''}`}>
            <p className="text-xs text-dark-700 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Failed</p>
            <p className="text-2xl font-black" style={{ color: '#ff4444' }}>{summary.failed}</p>
          </button>
          <button onClick={() => setFilter('blocked')} className={`card-glow p-4 text-left transition-all ${filter === 'blocked' ? 'ring-1 ring-primary-500' : ''}`}>
            <p className="text-xs text-dark-700 mb-1 flex items-center gap-1"><Ban className="w-3 h-3" /> No Contact Info</p>
            <p className="text-2xl font-black text-dark-800">{summary.blockedNoContact}</p>
          </button>
        </div>
      )}

      {summary && summary.smsUndeliveredDespiteAccepted > 0 && (
        <div className="mb-6 rounded-xl p-3 flex items-center gap-2 text-xs"
          style={{ background: 'rgba(255,196,0,0.08)', border: '1px solid rgba(255,196,0,0.25)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#ffc400' }} />
          <span className="text-yellow-400">
            {summary.smsUndeliveredDespiteAccepted} SMS message(s) were accepted by the carrier but never actually delivered
            (Twilio reported undelivered/failed after acceptance). These students may not have received their OTP or credentials by text.
          </span>
        </div>
      )}

      {/* Stats bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {selected.size > 0 && (
            <span className="text-sm text-primary-500 font-medium whitespace-nowrap">{selected.size} selected</span>
          )}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-dark-700 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or reference no."
              className="input pl-9 py-1.5 text-xs w-full"
            />
          </div>
        </div>
        <button
          onClick={() => loadStatus()}
          className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    checked={filteredStudents.length > 0 && filteredStudents.every(s => selected.has(s.student_id))}
                    onChange={toggleSelectAllFiltered}
                  />
                </th>
                <th>Student</th>
                <th>Email</th>
                <th>SMS</th>
                <th>SMS Carrier Result</th>
                <th>Attempts</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-dark-700">Loading...</td></tr>
              ) : filteredStudents.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-dark-700">{search.trim() ? `No students matching "${search}"` : 'No records found'}</td></tr>
              ) : filteredStudents.map(s => (
                <tr key={s.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(s.student_id)}
                      onChange={() => toggleSelected(s.student_id)}
                    />
                  </td>
                  <td>
                    <div className="font-medium text-white">{s.full_name}</div>
                    <div className="font-mono text-xs text-primary-500">{s.reference_number}</div>
                    {s.blocked_no_contact && (
                      <div className="text-xs mt-0.5" style={{ color: '#ff4444' }}>Missing contact info</div>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3 h-3 text-dark-700 flex-shrink-0" />
                      <StatusPill status={s.email_status} />
                    </div>
                    {s.email_error && <div className="text-xs text-dark-700 mt-1 max-w-48 truncate" title={s.email_error}>{s.email_error}</div>}
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3 text-dark-700 flex-shrink-0" />
                      <StatusPill status={s.sms_status} />
                    </div>
                    {s.sms_error && <div className="text-xs text-dark-700 mt-1 max-w-48 truncate" title={s.sms_error}>{s.sms_error}</div>}
                  </td>
                  <td>
                    {s.sms_delivery_status ? (
                      <>
                        <StatusPill status={s.sms_delivery_status} />
                        {s.sms_delivery_error && (
                          <div className="text-xs text-dark-700 mt-1 max-w-48 truncate" title={s.sms_delivery_error}>{s.sms_delivery_error}</div>
                        )}
                        {s.sms_delivered_at && (
                          <div className="text-xs text-dark-700 mt-1">{new Date(s.sms_delivered_at).toLocaleString()}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-dark-700">—</span>
                    )}
                  </td>
                  <td><span className="text-sm text-dark-800">{s.attempts}</span></td>
                  <td><span className="text-xs text-dark-700">{new Date(s.updated_at).toLocaleString()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Send/Regenerate confirmation modal */}
      {confirmSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setConfirmSend(false)} />
          <div className="relative card-glow p-6 w-full max-w-sm text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)' }}>
              <Send className="w-7 h-7 text-primary-500" />
            </div>
            <h3 className="font-bold text-white text-lg mb-2">
              {selected.size > 0 ? `Send Credentials to ${selected.size} Student(s)?` : 'Send Credentials to All Eligible Students?'}
            </h3>
            <p className="text-xs text-dark-700 mb-6">
              {selected.size > 0
                ? 'Only the selected students will be queued for credential generation and dispatch.'
                : 'Every student in this election who hasn\u2019t set their own password yet will be queued. Students already sent or who already logged in are automatically skipped.'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmSend(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={sendCredentials}
                disabled={sending}
                className="btn-primary flex-1"
              >
                {sending ? <div className="spinner" /> : 'Yes, Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
