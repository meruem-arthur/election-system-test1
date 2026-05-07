'use client';
import { useState, useEffect } from 'react';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, X, Users } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';

export default function AdminSettingsPage() {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', fullName: '', role: 'election_admin', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<any>(null);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) setCurrentAdmin(JSON.parse(user));
    if (JSON.parse(user || '{}').role === 'super_admin') {
      adminAPI.getAdmins().then(({ data }) => setAdmins(data)).catch(() => {}).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const createAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await adminAPI.createAdmin(form);
      toast.success('Admin account created');
      setShowCreate(false);
      setForm({ email: '', fullName: '', role: 'election_admin', password: '' });
      const { data } = await adminAPI.getAdmins();
      setAdmins(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create admin');
    } finally { setSubmitting(false); }
  };

  const roleLabels: Record<string, string> = {
    super_admin: 'Super Admin',
    election_admin: 'Election Admin',
    observer: 'Observer'
  };
  const roleBadge: Record<string, string> = {
    super_admin: 'badge-published',
    election_admin: 'badge-active',
    observer: 'badge-draft'
  };

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-black uppercase tracking-widest text-primary-500" style={{ fontFamily: 'var(--font-orbitron)' }}>
          Settings
        </h1>
        <p className="text-dark-800 text-sm mt-1">System configuration and admin management</p>
      </div>

      {/* Current admin info */}
      {currentAdmin && (
        <div className="card-glow p-6 mb-6">
          <h3 className="font-bold text-white mb-4">Your Account</h3>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-black"
              style={{ background: '#00ff88' }}>
              {currentAdmin.fullName?.[0]}
            </div>
            <div>
              <p className="font-semibold text-white">{currentAdmin.fullName}</p>
              <p className="text-sm text-dark-700">{currentAdmin.email}</p>
              <span className={`badge text-xs mt-1 ${roleBadge[currentAdmin.role]}`}>
                {roleLabels[currentAdmin.role]}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Admin management — super admin only */}
      {currentAdmin?.role === 'super_admin' && (
        <div className="card-glow p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary-500" />
              <h3 className="font-bold text-white">Admin Accounts</h3>
            </div>
            <button onClick={() => setShowCreate(true)} className="btn-primary py-2 px-4 text-sm">
              <Plus className="w-4 h-4" /> Add Admin
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><div className="spinner" /></div>
          ) : (
            <div className="space-y-3">
              {admins.map(a => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: '#0f0f0f' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-black"
                      style={{ background: '#00ff88' }}>
                      {a.full_name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{a.full_name}</p>
                      <p className="text-xs text-dark-700">{a.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge text-xs ${roleBadge[a.role]}`}>{roleLabels[a.role]}</span>
                    {!a.is_active && <span className="badge badge-ended text-xs">Inactive</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Admin Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowCreate(false)} />
          <div className="relative card-glow p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-white">Add Admin Account</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 text-dark-700 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={createAdmin} className="space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input className="input" value={form.fullName}
                  onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="election_admin">Election Admin</option>
                  <option value="observer">Observer</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div>
                <label className="label">Initial Password</label>
                <input type="password" className="input" placeholder="Min 8 characters"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1">
                  {submitting ? <div className="spinner" /> : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
