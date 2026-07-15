'use client';
import { useState, useEffect } from 'react';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, X, Calendar, Play, Square, Eye, ChevronRight, Trash2 } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

export default function AdminElectionsPage() {
  const router = useRouter();
  const [elections, setElections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', department: '',
    academicYear: '', startTime: '', endTime: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [admin, setAdmin] = useState<any>(null);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) setAdmin(JSON.parse(user));
  }, []);

  useEffect(() => { loadElections(); }, []);

  const loadElections = async () => {
    try {
      const { data } = await adminAPI.getElections();
      setElections(data);
    } catch { toast.error('Failed to load elections'); }
    finally { setLoading(false); }
  };

  const createElection = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await adminAPI.createElection(form);
      toast.success('Election created');
      setShowCreate(false);
      setForm({ title: '', description: '', department: '', academicYear: '', startTime: '', endTime: '' });
      loadElections();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create election');
    } finally { setSubmitting(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await adminAPI.updateElectionStatus(id, status);
      toast.success(`Election ${status}`);
      loadElections();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const deleteElection = async (election: any) => {
    try {
      await adminAPI.deleteElection(election.id);
      toast.success('Election deleted');
      setConfirmDelete(null);
      loadElections();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete election');
    }
  };

  const deleteAllElections = async () => {
    try {
      const { data } = await adminAPI.deleteAllElections();
      toast.success(data.message || 'All elections deleted');
      setConfirmDeleteAll(false);
      loadElections();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete all elections');
    }
  };

  const statusColors: Record<string, string> = {
    draft: 'badge-draft',
    active: 'badge-active',
    paused: 'badge-draft',
    ended: 'badge-ended',
    results_published: 'badge-published'
  };

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-primary-500" style={{ fontFamily: 'var(--font-orbitron)' }}>
            Elections
          </h1>
          <p className="text-dark-800 text-sm mt-1">Create and manage departmental elections</p>
        </div>
        <div className="flex items-center gap-3">
          {elections.length > 0 && admin?.role === 'super_admin' && (
            <button
              onClick={() => setConfirmDeleteAll(true)}
              className="flex items-center gap-2 py-2 px-4 rounded-xl font-semibold text-sm transition-all"
              style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', color: '#ff4444' }}
            >
              <Trash2 className="w-4 h-4" /> Delete All
            </button>
          )}
          {admin?.role === 'super_admin' && (
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> New Election
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      ) : elections.length === 0 ? (
        <div className="card-glow p-16 text-center">
          <Calendar className="w-12 h-12 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-700 mb-4">
            {admin?.role === 'super_admin' ? 'No elections created yet' : 'No elections assigned to you yet — ask a super admin to assign you to one.'}
          </p>
          {admin?.role === 'super_admin' && (
            <button onClick={() => setShowCreate(true)} className="btn-primary">Create First Election</button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {elections.map(e => (
            <div key={e.id} className="card-glow p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <h3 className="font-bold text-white text-lg">{e.title}</h3>
                    <span className={`badge ${statusColors[e.status] || 'badge-draft'}`}>
                      {e.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-dark-700">
                    <span>📍 {e.department}</span>
                    <span>📅 {e.academic_year}</span>
                    {e.start_time && <span>▶ {format(new Date(e.start_time), 'MMM d, yyyy HH:mm')}</span>}
                    {e.end_time && <span>⏹ {format(new Date(e.end_time), 'MMM d, yyyy HH:mm')}</span>}
                    <span className="text-dark-600">by {e.created_by_name}</span>
                  </div>
                  {e.description && <p className="text-sm text-dark-700 mt-2">{e.description}</p>}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {e.status === 'draft' && (
                    <button onClick={() => updateStatus(e.id, 'active')} className="btn-primary py-2 px-3 text-xs">
                      <Play className="w-3 h-3" /> Start
                    </button>
                  )}
                  {e.status === 'active' && (
                    <button onClick={() => updateStatus(e.id, 'ended')} className="btn-danger py-2 px-3 text-xs">
                      <Square className="w-3 h-3" /> Stop
                    </button>
                  )}
                  {e.status === 'ended' && (
                    <button onClick={() => updateStatus(e.id, 'results_published')} className="btn-primary py-2 px-3 text-xs">
                      <Eye className="w-3 h-3" /> Publish Results
                    </button>
                  )}
                  <button
                    onClick={() => router.push('/admin/dashboard')}
                    className="btn-secondary py-2 px-3 text-xs"
                  >
                    Dashboard <ChevronRight className="w-3 h-3" />
                  </button>
                  {admin?.role === 'super_admin' && (
                    <button
                      onClick={() => setConfirmDelete(e)}
                      className="py-2 px-3 text-xs rounded-xl transition-all"
                      style={{ background: 'transparent', border: '1px solid rgba(255,68,68,0.3)', color: '#ff4444' }}
                      title="Delete election"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setConfirmDelete(null)} />
          <div className="relative card-glow p-6 w-full max-w-sm text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)' }}>
              <Trash2 className="w-7 h-7" style={{ color: '#ff4444' }} />
            </div>
            <h3 className="font-bold text-white text-lg mb-2">Delete Election?</h3>
            <p className="text-sm text-dark-700 mb-1">
              <span className="text-white font-semibold">"{confirmDelete.title}"</span>
            </p>
            <p className="text-xs text-dark-700 mb-6">
              This will permanently delete the election and all its students, candidates and positions. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={() => deleteElection(confirmDelete)}
                className="flex-1 py-2 px-4 rounded-xl font-semibold text-sm transition-all"
                style={{ background: '#ff4444', color: '#fff' }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Confirmation Modal */}
      {confirmDeleteAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setConfirmDeleteAll(false)} />
          <div className="relative card-glow p-6 w-full max-w-sm text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)' }}>
              <Trash2 className="w-7 h-7" style={{ color: '#ff4444' }} />
            </div>
            <h3 className="font-bold text-white text-lg mb-2">Delete All Elections?</h3>
            <p className="text-sm text-dark-700 mb-1">
              This will permanently delete <span className="text-white font-semibold">all {elections.length} election(s)</span> and all their students, candidates, positions and votes.
            </p>
            <p className="text-xs text-dark-700 mb-6">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteAll(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={deleteAllElections}
                className="flex-1 py-2 px-4 rounded-xl font-semibold text-sm transition-all"
                style={{ background: '#ff4444', color: '#fff' }}
              >
                Yes, Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Election Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowCreate(false)} />
          <div className="relative card-glow p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-white text-lg">Create New Election</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 text-dark-700 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createElection} className="space-y-4">
              <div>
                <label className="label">Election Title *</label>
                <input className="input" placeholder="e.g. 2024/2025 SRC Elections"
                  value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Department *</label>
                  <input className="input" placeholder="Computer Science"
                    value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} required />
                </div>
                <div>
                  <label className="label">Academic Year *</label>
                  <input className="input" placeholder="2024/2025"
                    value={form.academicYear} onChange={e => setForm(f => ({ ...f, academicYear: e.target.value }))} required />
                </div>
              </div>

              <div>
                <label className="label">Description</label>
                <textarea className="input" rows={2} placeholder="Optional election description"
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start Date & Time</label>
                  <input type="datetime-local" className="input text-sm"
                    value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div>
                  <label className="label">End Date & Time</label>
                  <input type="datetime-local" className="input text-sm"
                    value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>

              <div className="rounded-xl p-3 text-xs text-dark-700"
                style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.1)' }}>
                The election will be created in <strong className="text-white">Draft</strong> status.
                You can start it manually from the dashboard or it will start automatically at the scheduled time.
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1">
                  {submitting ? <div className="spinner" /> : 'Create Election'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
