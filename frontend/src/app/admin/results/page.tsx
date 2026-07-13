'use client';
import { useState, useEffect } from 'react';
import { adminAPI, resultsAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { Download, Trophy, Users, TrendingUp, User } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import AdminLayout from '@/components/AdminLayout';

export default function AdminResultsPage() {
  const [elections, setElections] = useState<any[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adminAPI.getElections().then(({ data }) => {
      setElections(data);
      if (data.length > 0) setSelectedElectionId(data[data.length - 1].id);
    });
  }, []);

  useEffect(() => {
    if (selectedElectionId) loadResults();
  }, [selectedElectionId]);

  const loadResults = async () => {
    setLoading(true);
    try {
      const { data } = await resultsAPI.getResults(selectedElectionId);
      setResults(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load results');
      setResults(null);
    } finally { setLoading(false); }
  };

  const downloadPDF = async () => {
    try {
      const { data } = await resultsAPI.downloadPDF(selectedElectionId);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `election-results-${selectedElectionId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Failed to download PDF'); }
  };

  const COLORS = ['#00ff88', '#00cc6a', '#009950', '#006635', '#003320'];

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-primary-500" style={{ fontFamily: 'var(--font-orbitron)' }}>
            Election Results
          </h1>
          <p className="text-dark-800 text-sm mt-1">View and export results</p>
        </div>
        <div className="flex gap-3">
          <select value={selectedElectionId} onChange={e => setSelectedElectionId(e.target.value)} className="input py-2 text-sm">
            {elections.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <button onClick={downloadPDF} className="btn-secondary py-2 px-4 text-sm">
            <Download className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="spinner" style={{ width: 40, height: 40 }} /></div>
      ) : !results ? (
        <div className="card-glow p-16 text-center">
          <p className="text-dark-700">No results available or results not published yet</p>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="stat-card">
              <Users className="w-5 h-5 text-dark-700 mb-3" />
              <div className="stat-value">{results.stats.totalStudents}</div>
              <div className="stat-label">Total Students</div>
            </div>
            <div className="stat-card">
              <TrendingUp className="w-5 h-5 text-primary-500 mb-3" />
              <div className="stat-value">{results.stats.totalVoted}</div>
              <div className="stat-label">Votes Cast</div>
            </div>
            <div className="stat-card">
              <Trophy className="w-5 h-5 text-primary-500 mb-3" />
              <div className="stat-value">{results.stats.turnoutPercentage}%</div>
              <div className="stat-label">Turnout</div>
            </div>
          </div>

          {/* Results by position */}
          <div className="space-y-8">
            {results.positions?.map((position: any) => (
              <div key={position.id} className="card-glow p-6">
                <h2 className="text-lg font-black uppercase tracking-widest mb-4 flex items-center gap-2"
                  style={{ fontFamily: 'var(--font-orbitron)', color: '#00ff88' }}>
                  <Trophy className="w-5 h-5" />
                  {position.title}
                </h2>

                {position.hasTie && (
                  <div className="mb-5 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2"
                    style={{ background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.3)', color: '#ffaa00' }}>
                    ⚖️ Tie detected between {position.tiedCandidates?.join(' and ')} — Admin action required. A runoff or manual decision is needed for this position.
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Candidates list */}
                  <div className="space-y-3">
                    {position.candidates.map((c: any, i: number) => (
                      <div key={c.id} className={`flex items-center gap-4 p-3 rounded-xl transition-all ${c.isWinner ? 'border border-primary-500/30' : c.isTied ? 'border' : ''}`}
                        style={{
                          background: c.isWinner ? 'rgba(0,255,136,0.05)' : c.isTied ? 'rgba(255,170,0,0.04)' : '#0f0f0f',
                          borderColor: c.isTied && !c.isWinner ? 'rgba(255,170,0,0.3)' : undefined
                        }}>
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-dark-400 flex-shrink-0">
                          {c.imageUrl ? (
                            <img src={c.imageUrl} alt={c.fullName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <User className="w-6 h-6 text-dark-600" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-white">{c.fullName}</p>
                            {c.isYesNoVote ? (
                              <span className={`badge text-xs ${c.isWinner ? 'badge-active' : 'badge-ended'}`}>
                                {c.isWinner ? 'ELECTED ✓' : 'NOT ELECTED ✗'}
                              </span>
                            ) : (
                              <>
                                {c.isWinner && !c.isTied && <span className="badge badge-active text-xs">Winner 🏆</span>}
                                {c.isTied && (
                                  <span className="badge text-xs" style={{ background: 'rgba(255,170,0,0.15)', color: '#ffaa00', border: '1px solid rgba(255,170,0,0.3)' }}>
                                    Tied — Runoff Required ⚖️
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          <p className="text-xs text-dark-700">{c.program}</p>

                          {/* YES/NO breakdown */}
                          {c.isYesNoVote ? (
                            <div className="mt-2 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-primary-500 w-8">YES</span>
                                <div className="flex-1 progress-bar h-2">
                                  <div className="progress-fill" style={{ width: `${c.percentage}%` }} />
                                </div>
                                <span className="text-xs text-primary-500 font-mono w-16 text-right">{c.yesVotes} ({c.percentage}%)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-red-400 w-8">NO</span>
                                <div className="flex-1 progress-bar h-2">
                                  <div className="h-full rounded-full" style={{ width: `${c.noPercentage}%`, background: '#ff4444' }} />
                                </div>
                                <span className="text-xs text-red-400 font-mono w-16 text-right">{c.noVotes} ({c.noPercentage}%)</span>
                              </div>
                            </div>
                          ) : (
                            <div className="progress-bar mt-1.5">
                              <div className="progress-fill" style={{ width: `${c.percentage}%` }} />
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-mono font-bold text-lg" style={{ color: c.isTied ? '#ffaa00' : '#00ff88' }}>
                            {c.isYesNoVote ? c.yesVotes : c.votes}
                          </p>
                          <p className="text-xs text-dark-700">{c.percentage}%</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bar chart */}
                  <div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={position.candidates.map((c: any) => ({ name: c.fullName.split(' ')[0], votes: c.votes }))}>
                        <XAxis dataKey="name" tick={{ fill: '#666', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#666', fontSize: 10 }} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ background: '#111', border: '1px solid #00ff88', borderRadius: 8 }}
                          itemStyle={{ color: '#00ff88' }}
                        />
                        <Bar dataKey="votes" radius={[6, 6, 0, 0]}>
                          {position.candidates.map((_: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </AdminLayout>
  );
}
