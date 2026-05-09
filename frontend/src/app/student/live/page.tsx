'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { voteAPI } from '@/lib/api';
import { LogOut, User, Radio, RefreshCw, Users, CheckCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const REFRESH_INTERVAL = 10000; // 10 seconds

export default function LiveScoresPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) { router.push('/login'); return; }
    const parsed = JSON.parse(u);
    // Guard — only voted students can access
    if (!parsed.hasVoted) { router.push('/student/vote'); return; }
    setUser(parsed);
  }, []);

  const fetchScores = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const { data: res } = await voteAPI.getLiveScores();
      setData(res);
      setLastUpdated(new Date());
      setError('');
    } catch (err: any) {
      if (err.response?.status === 403) {
        router.push('/student/vote');
      } else {
        setError('Failed to load live scores');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setCountdown(REFRESH_INTERVAL / 1000);
    }
  }, []);

  // Initial fetch
  useEffect(() => { fetchScores(); }, [fetchScores]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchScores(), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchScores]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(c => (c <= 1 ? REFRESH_INTERVAL / 1000 : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const logout = () => { localStorage.clear(); router.push('/login'); };

  if (loading) return (
    <div className="min-h-screen bg-dark flex items-center justify-center">
      <div className="text-center">
        <div className="spinner mx-auto mb-4" style={{ width: 40, height: 40 }} />
        <p className="text-dark-700 text-sm">Loading live scores...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-dark-700 mb-4">{error}</p>
        <button onClick={() => fetchScores(true)} className="btn-primary">Try Again</button>
      </div>
    </div>
  );

  const { election, positions, stats } = data || {};
  const isActive = election?.status === 'active';

  return (
    <div className="min-h-screen bg-dark">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-50 glass border-b border-dark-500">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Live pulse */}
            {isActive && (
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ background: '#00ff88' }} />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5"
                    style={{ background: '#00ff88' }} />
                </span>
                <span className="text-xs font-bold uppercase tracking-widest"
                  style={{ color: '#00ff88' }}>Live</span>
              </div>
            )}
            {!isActive && (
              <span className="text-xs font-bold uppercase tracking-widest text-dark-700">
                {election?.status === 'ended' ? 'Final Results' : 'Election Ended'}
              </span>
            )}
            <h1 className="font-bold text-white text-sm hidden sm:block"
              style={{ fontFamily: 'var(--font-orbitron)' }}>
              {election?.title}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Countdown */}
            {isActive && (
              <div className="flex items-center gap-1.5 text-xs text-dark-700">
                <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`}
                  style={{ color: refreshing ? '#00ff88' : undefined }} />
                <span>Refreshing in {countdown}s</span>
              </div>
            )}
            {/* Manual refresh */}
            <button
              onClick={() => fetchScores(true)}
              disabled={refreshing}
              className="p-1.5 text-dark-700 hover:text-white transition-colors rounded-lg hover:bg-dark-400"
              title="Refresh now"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={logout} className="p-1.5 text-dark-700 hover:text-white transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* ── Turnout stats bar ── */}
        <div className="card-glow p-5 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary-500" />
              <span className="text-sm font-bold text-white uppercase tracking-widest"
                style={{ fontFamily: 'var(--font-orbitron)' }}>
                Voter Turnout
              </span>
            </div>
            {election?.endTime && isActive && (
              <div className="flex items-center gap-1.5 text-xs text-dark-700">
                <Clock className="w-3 h-3" />
                Closes {formatDistanceToNow(new Date(election.endTime), { addSuffix: true })}
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-black text-white">{stats?.totalStudents ?? 0}</p>
              <p className="text-xs text-dark-700 mt-0.5">Total Voters</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black" style={{ color: '#00ff88' }}>{stats?.totalVoted ?? 0}</p>
              <p className="text-xs text-dark-700 mt-0.5">Have Voted</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black" style={{ color: '#00ff88' }}>
                {stats?.turnoutPercentage ?? 0}%
              </p>
              <p className="text-xs text-dark-700 mt-0.5">Turnout</p>
            </div>
          </div>

          {/* Turnout progress bar */}
          <div className="w-full rounded-full h-3 overflow-hidden" style={{ background: '#1a1a1a' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${stats?.turnoutPercentage ?? 0}%`,
                background: 'linear-gradient(90deg, #00ff88, #00cc6a)',
                boxShadow: '0 0 8px rgba(0,255,136,0.4)'
              }}
            />
          </div>

          {lastUpdated && (
            <p className="text-xs text-dark-700 mt-3 text-right">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* ── Positions & candidates ── */}
        <div className="space-y-8">
          {positions?.map((position: any) => (
            <div key={position.id} className="card-glow p-5">

              {/* Position header */}
              <div className="flex items-center gap-3 mb-5">
                <h2 className="text-base font-black uppercase tracking-widest flex-1"
                  style={{ fontFamily: 'var(--font-orbitron)', color: '#00ff88' }}>
                  {position.title}
                </h2>
                {position.isYesNoVote && (
                  <span className="text-xs px-2 py-1 rounded-full"
                    style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.2)' }}>
                    Yes / No
                  </span>
                )}
              </div>

              <div className="space-y-4">
                {position.candidates.map((c: any) => (
                  <div key={c.id}>
                    {position.isYesNoVote ? (
                      /* ── YES/NO candidate ── */
                      <div className="rounded-2xl p-4"
                        style={{ background: '#0f0f0f', border: '1px solid #1a1a1a' }}>
                        {/* Candidate info */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-dark-400 flex-shrink-0">
                            {c.imageUrl
                              ? <img src={c.imageUrl} alt={c.fullName} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center">
                                  <User className="w-6 h-6 text-dark-600" />
                                </div>}
                          </div>
                          <div>
                            <p className="font-bold text-white">{c.fullName}</p>
                            {c.program && <p className="text-xs text-dark-700">{c.program}</p>}
                          </div>
                          {c.isLeading && (
                            <span className="ml-auto text-xs px-2 py-1 rounded-full font-bold"
                              style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.3)' }}>
                              Leading ↑
                            </span>
                          )}
                          {!c.isLeading && (c.yesVotes + c.noVotes) > 0 && (
                            <span className="ml-auto text-xs px-2 py-1 rounded-full font-bold"
                              style={{ background: 'rgba(255,68,68,0.1)', color: '#ff4444', border: '1px solid rgba(255,68,68,0.2)' }}>
                              Trailing ↓
                            </span>
                          )}
                        </div>

                        {/* YES bar */}
                        <div className="mb-2">
                          <div className="flex justify-between text-xs mb-1">
                            <span style={{ color: '#00ff88' }}>YES</span>
                            <span style={{ color: '#00ff88' }}>{c.yesVotes} votes · {c.percentage}%</span>
                          </div>
                          <div className="w-full rounded-full h-4 overflow-hidden" style={{ background: '#1a1a1a' }}>
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${c.percentage}%`,
                                background: 'linear-gradient(90deg, #00ff88, #00cc6a)',
                                boxShadow: c.percentage > 0 ? '0 0 6px rgba(0,255,136,0.4)' : 'none'
                              }} />
                          </div>
                        </div>

                        {/* NO bar */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span style={{ color: '#ff4444' }}>NO</span>
                            <span style={{ color: '#ff4444' }}>{c.noVotes} votes · {c.noPercentage}%</span>
                          </div>
                          <div className="w-full rounded-full h-4 overflow-hidden" style={{ background: '#1a1a1a' }}>
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${c.noPercentage}%`,
                                background: 'linear-gradient(90deg, #ff4444, #cc2222)',
                                boxShadow: c.noPercentage > 0 ? '0 0 6px rgba(255,68,68,0.3)' : 'none'
                              }} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* ── Normal candidate ── */
                      <div className="flex items-center gap-3 rounded-xl p-3 transition-all"
                        style={{
                          background: c.isLeading ? 'rgba(0,255,136,0.04)' : '#0f0f0f',
                          border: `1px solid ${c.isLeading ? 'rgba(0,255,136,0.2)' : '#1a1a1a'}`
                        }}>
                        {/* Avatar */}
                        <div className="w-11 h-11 rounded-xl overflow-hidden bg-dark-400 flex-shrink-0">
                          {c.imageUrl
                            ? <img src={c.imageUrl} alt={c.fullName} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center">
                                <User className="w-5 h-5 text-dark-600" />
                              </div>}
                        </div>

                        {/* Name + bar */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <p className="font-bold text-white text-sm truncate">{c.fullName}</p>
                            {c.isLeading && (
                              <span className="text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                                style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88' }}>
                                #1
                              </span>
                            )}
                          </div>
                          {/* Vote bar */}
                          <div className="w-full rounded-full h-3 overflow-hidden" style={{ background: '#1a1a1a' }}>
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${c.percentage}%`,
                                background: c.isLeading
                                  ? 'linear-gradient(90deg, #00ff88, #00cc6a)'
                                  : 'linear-gradient(90deg, #333, #444)',
                                boxShadow: c.isLeading && c.percentage > 0
                                  ? '0 0 6px rgba(0,255,136,0.4)' : 'none'
                              }} />
                          </div>
                        </div>

                        {/* Vote count */}
                        <div className="text-right flex-shrink-0 min-w-16">
                          <p className="font-mono font-bold text-sm"
                            style={{ color: c.isLeading ? '#00ff88' : '#666' }}>
                            {c.totalVotes}
                          </p>
                          <p className="text-xs text-dark-700">{c.percentage}%</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div className="text-center mt-10 pb-8">
          {isActive && (
            <p className="text-xs text-dark-700 mb-4 flex items-center justify-center gap-2">
              <Radio className="w-3 h-3" style={{ color: '#00ff88' }} />
              Scores update automatically every 10 seconds
            </p>
          )}
          <button onClick={logout} className="btn-secondary">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
          <p className="text-xs mt-6" style={{ color: '#333' }}>
            Developed by{' '}
            <span style={{ color: '#00ff88', opacity: 0.6 }}>LIL PEE</span>
            {' '}&amp;{' '}
            <span style={{ color: '#00ff88', opacity: 0.6 }}>CK442</span>
          </p>
        </div>
      </div>
    </div>
  );
}
