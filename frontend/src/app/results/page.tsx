'use client';
import { useState, useEffect } from 'react';
import { resultsAPI } from '@/lib/api';
import { Trophy, User, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PublicResultsPage() {
  const router = useRouter();
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    try {
      // Get the latest election
      const electionsRes = await adminAPI.getElections();
      const elections = electionsRes.data;
      if (!elections.length) {
        setError('No election found.');
        return;
      }
      // Get latest published election
      const published = [...elections].reverse().find((e: any) => e.status === 'results_published');
      if (!published) {
        setError('Results have not been officially released yet. Please check back later.');
        return;
      }
      const { data } = await resultsAPI.getResults(published.id);
      setResults(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Results not available yet.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => { localStorage.clear(); router.push('/login'); };

  if (loading) return (
    <div className="min-h-screen bg-dark flex items-center justify-center">
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-6">🔒</div>
        <h1 className="text-xl font-black uppercase tracking-widest mb-4" style={{ fontFamily: 'var(--font-orbitron)', color: '#00ff88' }}>
          Results Not Available
        </h1>
        <p className="text-dark-700 mb-8">{error}</p>
        <button onClick={logout} className="btn-secondary">
          <LogOut className="w-4 h-4" /> Back to Login
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-dark py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-black uppercase tracking-widest mb-2"
            style={{ fontFamily: 'var(--font-orbitron)', color: '#00ff88' }}>
            Election Results
          </h1>
          <p className="text-dark-700 text-sm">{results?.election?.title}</p>
          <div className="flex justify-center gap-6 mt-4 text-sm">
            <span className="text-dark-700">Total Students: <span className="text-white font-bold">{results?.stats?.totalStudents}</span></span>
            <span className="text-dark-700">Voted: <span style={{ color: '#00ff88' }} className="font-bold">{results?.stats?.totalVoted}</span></span>
            <span className="text-dark-700">Turnout: <span style={{ color: '#00ff88' }} className="font-bold">{results?.stats?.turnoutPercentage}%</span></span>
          </div>
        </div>

        {/* Results by position */}
        <div className="space-y-8">
          {results?.positions?.map((position: any) => (
            <div key={position.id} className="card-glow p-6">
              <h2 className="font-black uppercase tracking-widest mb-5 flex items-center gap-2 text-base"
                style={{ fontFamily: 'var(--font-orbitron)', color: '#00ff88' }}>
                <Trophy className="w-4 h-4" /> {position.title}
              </h2>

              <div className="space-y-3">
                {position.candidates.map((c: any, i: number) => (
                  <div key={c.id} className={`flex items-center gap-4 p-3 rounded-xl ${c.isWinner ? 'border' : ''}`}
                    style={{ background: c.isWinner ? 'rgba(0,255,136,0.05)' : '#0f0f0f', borderColor: c.isWinner ? 'rgba(0,255,136,0.3)' : 'transparent' }}>
                    <div className="w-11 h-11 rounded-full overflow-hidden bg-dark-400 flex-shrink-0 flex items-center justify-center">
                      {c.imageUrl
                        ? <img src={c.imageUrl} alt={c.fullName} className="w-full h-full object-cover" />
                        : <User className="w-5 h-5 text-dark-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-white text-sm">{c.fullName}</p>
                        {c.isYesNoVote ? (
                          <span className={`badge text-xs ${c.isWinner ? 'badge-active' : 'badge-ended'}`}>
                            {c.isWinner ? 'ELECTED ✓' : 'NOT ELECTED ✗'}
                          </span>
                        ) : (
                          c.isWinner && <span className="badge badge-active text-xs">Winner 🏆</span>
                        )}
                      </div>

                      {/* YES/NO breakdown */}
                      {c.isYesNoVote ? (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-primary-500 w-8">YES</span>
                            <div className="flex-1 progress-bar h-2">
                              <div className="progress-fill" style={{ width: `${c.percentage}%` }} />
                            </div>
                            <span className="text-xs text-primary-500 font-mono">{c.yesVotes} ({c.percentage}%)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-400 w-8">NO</span>
                            <div className="flex-1 progress-bar h-2">
                              <div className="h-full rounded-full" style={{ width: `${c.noPercentage}%`, background: '#ff4444' }} />
                            </div>
                            <span className="text-xs text-red-400 font-mono">{c.noVotes} ({c.noPercentage}%)</span>
                          </div>
                        </div>
                      ) : (
                        <div className="progress-bar mt-1.5">
                          <div className="progress-fill" style={{ width: `${c.percentage}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-mono font-bold" style={{ color: '#00ff88' }}>
                        {c.isYesNoVote ? c.yesVotes : c.votes}
                      </p>
                      <p className="text-xs text-dark-700">{c.percentage}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <button onClick={logout} className="btn-secondary">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
          <p className="text-xs text-dark-700 mt-6">Developed by <span style={{ color: '#00ff88', opacity: 0.6 }}>LIL PEE</span> & <span style={{ color: '#00ff88', opacity: 0.6 }}>CK442</span></p>
        </div>
      </div>
    </div>
  );
}
