'use client';
import { useState, useEffect } from 'react';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, Shield, Eye, EyeOff } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { format } from 'date-fns';

const ROLES = ['election_admin', 'observer'];

export default function AdminUsersPage() {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: '', fullName: '', role: 'election_admin', password: '' });

  useEffect(() => { loadAdmins(); }, []);

  const loadAdmins = async () => {
    try {
      const { data } = await adminAPI.getAdmins();
      setAdmins(data);
    } catch { toast.error('Failed to load admin users'); }
    finally { setLoading(false); }
  };

  const createAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await adminAPI.createAdmin(form);
      toast.success('Admin created');
      setShowCreate(false);
      setForm({ email: '', fullName: '', role: 'election_admin', password: '' });
      loadAdmins();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create admin');
    } finally { setCreating(false); }
  };

  const roleColor: Record<string, string> = {
    super_admin: 'badge-active',
    election_admin: 'badge-draft',
    observer: 'badge-published'
  };

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest"
            style={{ fontFamily: 'var(--font-orbitron)', color: '#00ff88' }}>Admin Users</h1>
          <p className="text-dark-800 text-sm mt-1">Manage system administrators</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> New Admin
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md card-glow p-8 animate-fade-in">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="w-5 h-5 text-primary-500" />
              <h2 className="text-lg font-bold text-white">Create Admin Account</h2>
            </div>
            <form onSubmit={createAdmin} className="space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input className="input" placeholder="John Doe" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" placeholder="admin@election.edu.gh" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="input pr-12"
                    placeholder="Min 8 characters"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required minLength={8}
                  />
                  <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-700 hover:text-white"
                    onClick={() => setShowPw(!showPw)}>
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={creating} className="btn-primary flex-1">
                  {creating ? <div className="spinner" /> : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Table */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="spinner" style={{ width: 36, height: 36 }} /></div>
      ) : (
        <div className="card-glow overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
              </tr>
            </thead>
            <tbody>
              {admins.map(admin => (
                <tr key={admin.id}>
                  <td className="font-semibold text-white">{admin.full_name}</td>
                  <td className="text-dark-800 font-mono text-xs">{admin.email}</td>
                  <td><span className={`badge ${roleColor[admin.role] || 'badge-draft'}`}>{admin.role.replace('_', ' ')}</span></td>
                  <td>
                    <span className={`badge ${admin.is_active ? 'badge-active' : 'badge-ended'}`}>
                      {admin.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="text-dark-700 text-xs">
                    {admin.last_login ? format(new Date(admin.last_login), 'PPp') : 'Never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
