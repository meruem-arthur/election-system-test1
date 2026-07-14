'use client';
import { useState, useEffect } from 'react';
import { adminAPI, resultsAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { Users, Vote, TrendingUp, Clock, Play, Square, Download, RefreshCw, BarChart2, Eye, UserPlus, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import AdminLayout from '@/components/AdminLayout';
import { useRouter } from 'next/navigation';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [elections, setElections] = useState<any[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState<string>('');
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [currentAdmin, setCurrentAdmin] = useState<any>(null);
  const [assignedAdmins, setAssignedAdmins] = useState<any[]>([]);
  const [allAdmins, setAllAdmins] = useState<any[]>([]);
  const [adminToAssign, setAdminToAssign] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [unassigningId, setUnassigningId] = useState<string | null>(null);

  useEffect(() => {
    loadElections();
    const user = localStorage.getItem('user');
    if (user) setCurrentAdmin(JSON.parse(user));
  }, []);

  useEffect(() => {
    if (selectedElectionId) {
      loadDashboard();
      loadAssignedAdmins();
    }
  }, [selectedElectionId]);

  const loadElections = async () => {
    try {
      const { data } = await adminAPI.getElections();
      setElections(data);
      if (data.length > 0) setSelectedElectionId(data[data.length - 1].id);
    } catch {
      toast.error('Failed to load elections');
    } finally {
      setLoading(false);
    }
  };

  const loadDashboard = async () => {
    setRefreshing(true);
    try {
      const { data } = await adminAPI.getDashboard(selectedElectionId);
      setDashboard(data);
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setRefreshing(false);
    }
  };

  const loadAssignedAdmins = async () => {
    // Only super_admin can manage assignments — the backend enforces this
    // too, but skip the calls entirely for non-super_admins to avoid a
    // pointless 403 in the console.
    const user = localStorage.getItem('user');
    const parsedUser = user ? JSON.parse(user) : null;
    if (parsedUser?.role !== 'super_admin') return;

    try {
      const [assignedRes, allRes] = await Promise.all([
        adminAPI.getElectionAdmins(selectedElectionId),
        adminAPI.getAdmins()
      ]);
      setAssignedAdmins(assignedRes.data);
      setAllAdmins(allRes.data);
    } catch {
      toast.error('Failed to load assigned admins');
    }
  };

  const assignAdmin = async () => {
    if (!adminToAssign) return;
    setAssigning(true);
    try {
      await adminAPI.assignAdminToElection(adminToAssign, selectedElectionId);
      toast.success('Admin assigned to this election');
      setAdminToAssign('');
      loadAssignedAdmins();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to assign admin');
    } finally { setAssigning(false); }
  };

  const unassignAdmin = async (adminId: string) => {
    setUnassigningId(adminId);
    try {
      await adminAPI.unassignAdminFromElection(adminId, selectedElectionId);
      toast.success('Admin unassigned from this election');
      loadAssignedAdmins();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to unassign admin');
    } finally { setUnassigningId(null); }
  };

  const updateStatus = async (status: string) => {
    try {
      await adminAPI.updateElectionStatus(selectedElectionId, status);
      toast.success(`Election ${status}`);
      loadDashboard();
      loadElections();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update status');
    }
  };

  const downloadPDF = async () => {
    try {
      const { data } = await resultsAPI.downloadPDF(selectedElectionId);
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `election-results.pdf`;
      a.click();
    } catch {
      toast.error('Failed to download PDF');
    }
  };

  const currentElection = elections.find(e => e.id === selectedElectionId);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="spinner" style={{ width: 40, height: 40 }} />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest" style={{ fontFamily: 'var(--font-orbitron)', color: '#00ff88' }}>
            Dashboard
          </h1>
          <p className="text-dark-800 text-sm mt-1">Live election monitoring & control</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Election selector */}
          <select
            value={selectedElectionId}
            onChange={e => setSelectedElectionId(e.target.value)}
            className="input text-sm py-2"
            style={{ width: 'auto' }}
          >
            {elections.map(e => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>

          <button onClick={loadDashboard} className="btn-secondary py-2 px-3">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {!dashboard && elections.length === 0 && (
        <div className="card-glow p-16 text-center">
          <p className="text-dark-700 mb-4">No elections found</p>
          <button onClick={() => router.push('/admin/elections')} className="btn-primary">
            Create First Election
          </button>
        </div>
      )}

      {dashboard && (
        <>
          {/* Election Status Bar */}
          <div className="card-glow p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${currentElection?.status === 'active' ? 'bg-primary-500 animate-pulse' : 'bg-dark-700'}`} />
              <div>
                <span className="text-sm font-bold text-white">{currentElection?.title}</span>
                <span className={`ml-3 badge ${
                  currentElection?.status === 'active' ? 'badge-active' :
                  currentElection?.status === 'ended' ? 'badge-ended' :
                  currentElection?.status === 'results_published' ? 'badge-published' : 'badge-draft'
                }`}>
                  {currentElection?.status?.replace('_', ' ').toUpperCase()}
                </span>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {currentElection?.status === 'draft' && (
                <button onClick={() => updateStatus('active')} className="btn-primary py-2 px-4 text-sm">
                  <Play className="w-4 h-4" /> Start Election
                </button>
              )}
              {currentElection?.status === 'active' && (
                <button onClick={() => updateStatus('ended')} className="btn-danger py-2 px-4 text-sm">
                  <Square className="w-4 h-4" /> Stop Election
                </button>
              )}
              {currentElection?.status === 'ended' && (
                <button onClick={() => updateStatus('results_published')} className="btn-primary py-2 px-4 text-sm">
                  <Eye className="w-4 h-4" /> Publish Results
                </button>
              )}
              <button onClick={downloadPDF} className="btn-secondary py-2 px-4 text-sm">
                <Download className="w-4 h-4" /> Export PDF
              </button>
            </div>
          </div>

          {/* Assigned Admins — super_admin only, matches Admin Users page assignments */}
          {currentAdmin?.role === 'super_admin' && (
            <div className="card-glow p-6 mb-6">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-primary-500" />
                Admins Assigned to This Election
              </h3>

              {assignedAdmins.length === 0 ? (
                <p className="text-sm text-dark-700 mb-4">No admins assigned to this election yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2 mb-4">
                  {assignedAdmins.map(admin => (
                    <div key={admin.id} className="flex items-center gap-2 bg-dark-400 rounded-lg px-3 py-1.5">
                      <span className="text-sm text-white">{admin.full_name}</span>
                      <span className="text-xs text-dark-700">({admin.role.replace('_', ' ')})</span>
                      <button
                        onClick={() => unassignAdmin(admin.id)}
                        disabled={unassigningId === admin.id}
                        title="Remove from this election"
                        className="text-dark-700 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <select
                  className="input text-sm py-2 flex-1"
                  value={adminToAssign}
                  onChange={e => setAdminToAssign(e.target.value)}
                >
                  <option value="">Select an admin to assign...</option>
                  {allAdmins
                    .filter(a => a.role !== 'super_admin' && !assignedAdmins.some(aa => aa.id === a.id))
                    .map(a => (
                      <option key={a.id} value={a.id}>{a.full_name} ({a.email})</option>
                    ))}
                </select>
                <button onClick={assignAdmin} disabled={!adminToAssign || assigning} className="btn-primary py-2 px-4 text-sm">
                  {assigning ? <div className="spinner" /> : <><UserPlus className="w-4 h-4" /> Assign</>}
                </button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              icon={<Users className="w-5 h-5" />}
              label="Total Students"
              value={dashboard.stats.total_students}
            />
            <StatCard
              icon={<Vote className="w-5 h-5" />}
              label="Votes Cast"
              value={dashboard.stats.voted}
              accent
            />
            <StatCard
              icon={<Clock className="w-5 h-5" />}
              label="Not Voted"
              value={dashboard.stats.not_voted}
            />
            <StatCard
              icon={<TrendingUp className="w-5 h-5" />}
              label="Turnout"
              value={`${dashboard.stats.turnoutPercentage}%`}
              accent
            />
          </div>

          {/* Turnout Progress */}
          <div className="card-glow p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white">Voter Turnout</h3>
              <span style={{ color: '#00ff88' }} className="font-mono text-lg font-bold">
                {dashboard.stats.turnoutPercentage}%
              </span>
            </div>
            <div className="progress-bar h-3">
              <div className="progress-fill h-full" style={{ width: `${dashboard.stats.turnoutPercentage}%` }} />
            </div>
            <div className="flex justify-between text-xs text-dark-700 mt-2">
              <span>{dashboard.stats.voted} voted</span>
              <span>{dashboard.stats.not_voted} remaining</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Turnout by Level */}
            {dashboard.turnoutByLevel?.length > 0 && (
              <div className="card-glow p-6">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-primary-500" />
                  Turnout by Level
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dashboard.turnoutByLevel.map((l: any) => ({
                    name: `Level ${l.level}`,
                    voted: parseInt(l.voted),
                    total: parseInt(l.total)
                  }))}>
                    <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#666', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: '#111', border: '1px solid #00ff88', borderRadius: 8 }}
                      itemStyle={{ color: '#00ff88' }}
                    />
                    <Bar dataKey="voted" fill="#00ff88" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="total" fill="#1a1a1a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Live Vote Counts */}
            <div className="card-glow p-6">
              <h3 className="font-bold text-white mb-4">Live Vote Counts</h3>
              <div className="space-y-3 max-h-56 overflow-y-auto">
                {dashboard.candidateVotes?.map((cv: any) => (
                  <div key={`${cv.position}-${cv.candidate}`} className="flex items-center gap-3">
                    {cv.image_url && (
                      <img src={cv.image_url} alt={cv.candidate} className="w-8 h-8 rounded-full object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-white truncate">{cv.candidate}</span>
                        <span style={{ color: '#00ff88' }} className="font-mono ml-2">{cv.votes}</span>
                      </div>
                      <p className="text-xs text-dark-700">{cv.position}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}

function StatCard({ icon, label, value, accent }: any) {
  return (
    <div className="stat-card">
      <div className={`mb-3 ${accent ? 'text-primary-500' : 'text-dark-700'}`}>{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
