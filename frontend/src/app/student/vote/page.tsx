'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { voteAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { CheckCircle, Clock, ChevronRight, User, LogOut, HelpCircle, Shield, BarChart2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
import WaveBackground from '@/components/WaveBackground';

interface Candidate { id: string; fullName: string; imageUrl: string | null; bio: string; program: string; level: string; }
interface Position { id: string; title: string; candidates: Candidate[]; }

type VoteSelections = Record<string, string>; // positionId -> candidateId

type PageState = 'loading' | 'not_started' | 'ended' | 'already_voted' | 'voting' | 'review' | 'success';

export default function VotingPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>('loading');
  const [positions, setPositions] = useState<Position[]>([]);
  const [selections, setSelections] = useState<VoteSelections>({});
  const [election, setElection] = useState<any>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) setUser(JSON.parse(u));
    loadCandidates();
  }, []);

  const loadCandidates = async () => {
    try {
      const { data } = await voteAPI.getCandidates();

      if (data.hasVoted) return setState('already_voted');

      if (data.electionStatus !== 'active') {
        setElection(data);
        setState(data.electionStatus === 'ended' || data.electionStatus === 'results_published' ? 'ended' : 'not_started');
        return;
      }

      setElection(data.election);
      setPositions(data.positions || []);
      setState('voting');
    } catch (err: any) {
      toast.error('Failed to load candidates');
      setState('not_started');
    }
  };

  const handleSelect = (positionId: string, candidateId: string) => {
    setSelections(prev => ({ ...prev, [positionId]: candidateId }));
  };

  const allSelected = positions.length > 0 && positions.every(p => selections[p.id]);

  const handleReview = () => {
    if (!allSelected) {
      const missing = positions.filter(p => !selections[p.id]).map(p => p.title).join(', ');
      return toast.error(`Please select candidates for: ${missing}`);
    }
    setState('review');
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Strip NO_ prefix — send candidateId + a voteType flag
      const votes = Object.entries(selections).map(([positionId, selectionId]) => {
        const isNo = selectionId.startsWith('NO_');
        const candidateId = isNo ? selectionId.replace('NO_', '') : selectionId;
        return { positionId, candidateId, voteType: isNo ? 'no' : 'yes' };
      });
      const { data } = await voteAPI.castVote(votes);
      setReceipt(data.receiptCode);
      setState('success');

      // Update local user
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...u, hasVoted: true }));
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit vote');
      setState('voting');
    } finally {
      setSubmitting(false);
    }
  };

  const logout = () => {
    localStorage.clear();
    router.push('/login');
  };

  // ============================================================
  // RENDER STATES
  // ============================================================

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center relative overflow-hidden">
        <WaveBackground />
        <div className="text-center relative z-10">
          <div className="spinner mx-auto mb-4" style={{ width: 40, height: 40 }} />
          <p className="text-dark-800 text-sm">Loading election data...</p>
        </div>
      </div>
    );
  }

  if (state === 'not_started') {
    return (
      <StatusScreen
        icon="⏳"
        title="Voting Has Not Started"
        message="The election has not opened yet. Please check back when voting begins."
        startTime={election?.startTime}
        onLogout={logout}
        user={user}
      />
    );
  }

  if (state === 'ended') {
    return (
      <StatusScreen
        icon="🔒"
        title="Voting Has Ended"
        message="The voting period has closed. Results will be announced officially."
        onLogout={logout}
        user={user}
        showResults
        electionId={election?.election?.id}
      />
    );
  }

  if (state === 'already_voted') {
    return (
      <StatusScreen
        icon="✅"
        title="Vote Already Recorded"
        message="You have already voted in this election. Thank you for participating!"
        onLogout={logout}
        user={user}
        showLive
      />
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center p-4 relative overflow-hidden">
        <WaveBackground />
        <div className="max-w-md w-full text-center animate-fade-in">
          <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8"
            style={{ background: 'rgba(0,255,136,0.1)', border: '2px solid #00ff88', boxShadow: '0 0 40px rgba(0,255,136,0.3)' }}>
            <CheckCircle className="w-12 h-12" style={{ color: '#00ff88' }} />
          </div>
          <h1 className="text-3xl font-black mb-4 uppercase tracking-wide" style={{ fontFamily: 'var(--font-orbitron)', color: '#00ff88' }}>
            Vote Submitted
          </h1>
          <p className="text-dark-800 mb-8">Your vote has been securely recorded. Thank you for participating in your departmental election.</p>

          <div className="card-glow p-6 mb-6 text-left">
            <p className="text-xs uppercase tracking-widest text-dark-700 mb-2">Vote Receipt</p>
            <p className="font-mono text-primary-500 text-lg">{receipt}</p>
            <p className="text-xs text-dark-700 mt-2">
              {new Date().toLocaleString()} · Your vote is anonymous and secure.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-dark-700 mb-8">
            <Shield className="w-3 h-3" />
            <span>Your ballot is anonymous. Your identity cannot be linked to your choices.</span>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push('/student/live')}
              className="btn-primary w-full"
            >
              <BarChart2 className="w-4 h-4" /> Watch Live Scores
            </button>
            <button onClick={logout} className="btn-secondary w-full">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'review') {
    return (
      <div className="min-h-screen bg-dark p-4 py-8 relative overflow-hidden">
        <WaveBackground />
        <div className="max-w-2xl mx-auto animate-fade-in">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black uppercase tracking-widest mb-2" style={{ fontFamily: 'var(--font-orbitron)', color: '#00ff88' }}>
              Review Your Vote
            </h1>
            <p className="text-dark-800">Please confirm your selections before submitting</p>
          </div>

          <div className="space-y-4 mb-8">
            {positions.map(position => {
              const selectionId = selections[position.id];
              const isNoVote = selectionId?.startsWith('NO_');
              const chosen = position.candidates.find(c =>
                isNoVote ? `NO_${c.id}` === selectionId : c.id === selectionId
              );
              const isSingleCandidate = position.candidates.length === 1;

              return (
                <div key={position.id} className="card-glow p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-dark-400 flex-shrink-0 flex items-center justify-center">
                    {isSingleCandidate ? (
                      <span className="text-xl font-black" style={{ color: isNoVote ? '#ff4444' : '#00ff88' }}>
                        {isNoVote ? '✗' : '✓'}
                      </span>
                    ) : chosen?.imageUrl ? (
                      <img src={chosen.imageUrl} alt={chosen.fullName} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-dark-700" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-widest text-dark-700">{position.title}</p>
                    <p className="font-bold text-white">{chosen?.fullName}</p>
                    {isSingleCandidate && (
                      <p className="text-xs font-bold mt-0.5" style={{ color: isNoVote ? '#ff4444' : '#00ff88' }}>
                        Voted: {isNoVote ? 'NO' : 'YES'}
                      </p>
                    )}
                    {!isSingleCandidate && chosen?.program && (
                      <p className="text-xs text-dark-800">{chosen.program}</p>
                    )}
                  </div>
                  <CheckCircle className="w-5 h-5 text-primary-500" />
                </div>
              );
            })}
          </div>

          <div className="card p-4 mb-8" style={{ borderColor: 'rgba(255,170,0,0.3)', background: 'rgba(255,170,0,0.05)' }}>
            <p className="text-xs text-yellow-400 font-semibold">⚠️ This action is irreversible. Once submitted, your vote cannot be changed.</p>
          </div>

          <div className="flex gap-4">
            <button onClick={() => setState('voting')} className="btn-secondary flex-1">
              ← Go Back
            </button>
            <button onClick={handleSubmit} disabled={submitting} className="btn-primary flex-1">
              {submitting ? <div className="spinner" /> : 'Submit My Vote'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // MAIN VOTING UI
  // ============================================================

  return (
    <div className="min-h-screen bg-dark">
      {/* Top bar */}
      <div className="sticky top-0 z-50 glass border-b border-dark-500">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <span className="text-xs uppercase tracking-widest text-dark-700">Election</span>
            <h1 className="font-bold text-white text-sm" style={{ fontFamily: 'var(--font-orbitron)' }}>
              {election?.title}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {election?.endTime && (
              <div className="flex items-center gap-2 text-xs text-dark-800">
                <Clock className="w-3 h-3 text-primary-500" />
                Closes {formatDistanceToNow(new Date(election.endTime), { addSuffix: true })}
              </div>
            )}
            <div className="text-xs text-dark-700 hidden sm:block">
              {user?.fullName}
            </div>
            <button onClick={logout} className="p-2 text-dark-700 hover:text-white transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs text-dark-700">{Object.keys(selections).length}/{positions.length} positions selected</span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${positions.length > 0 ? (Object.keys(selections).length / positions.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Voting sections */}
      <div className="max-w-4xl mx-auto px-4 pb-32 space-y-12">
        {positions.map((position, idx) => (
          <div key={position.id} className="animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: selections[position.id] ? '#00ff88' : '#1a1a1a', color: selections[position.id] ? '#000' : '#444' }}>
                {selections[position.id] ? '✓' : idx + 1}
              </div>
              <h2 className="text-xl font-black uppercase tracking-widest" style={{ fontFamily: 'var(--font-orbitron)', color: selections[position.id] ? '#00ff88' : '#ffffff' }}>
                {position.title}
              </h2>
              {(position.candidates?.length ?? 0) === 1 && (
                <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.2)' }}>
                  Yes / No Vote
                </span>
              )}
            </div>

            {(position.candidates?.length ?? 0) === 1 ? (
              /* YES/NO VOTING — single candidate */
              <YesNoCard
                candidate={position.candidates[0]}
                selection={selections[position.id]}
                onSelect={(value) => handleSelect(position.id, value)}
              />
            ) : (
              /* NORMAL VOTING — multiple candidates */
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {(position.candidates ?? []).map(candidate => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    isSelected={selections[position.id] === candidate.id}
                    onSelect={() => handleSelect(position.id, candidate.id)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 glass border-t border-dark-500 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="text-sm text-dark-700">
            {allSelected ? (
              <span style={{ color: '#00ff88' }}>✓ All positions selected</span>
            ) : (
              `${positions.length - Object.keys(selections).length} position(s) remaining`
            )}
          </div>
          <button
            onClick={handleReview}
            disabled={!allSelected}
            className="btn-primary"
          >
            Review & Submit
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// YES/NO CARD COMPONENT (single candidate positions)
// ============================================================

function YesNoCard({ candidate, selection, onSelect }: {
  candidate: Candidate;
  selection: string | undefined;
  onSelect: (value: string) => void;
}) {
  const votedYes = selection === candidate.id;
  const votedNo = selection === `NO_${candidate.id}`;

  return (
    <div className="card-glow p-6">
      {/* Candidate info */}
      <div className="flex items-center gap-5 mb-6">
        <div className="w-20 h-20 rounded-2xl overflow-hidden bg-dark-400 flex-shrink-0">
          {candidate.imageUrl ? (
            <img src={candidate.imageUrl} alt={candidate.fullName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className="w-10 h-10 text-dark-600" />
            </div>
          )}
        </div>
        <div>
          <p className="font-black text-white text-lg">{candidate.fullName}</p>
          {candidate.program && <p className="text-sm text-dark-700 mt-1">{candidate.program}</p>}
          {candidate.level && <p className="text-xs text-dark-700">Level {candidate.level}</p>}
          {candidate.bio && <p className="text-xs text-dark-800 mt-2 italic">"{candidate.bio}"</p>}
        </div>
      </div>

      <p className="text-xs uppercase tracking-widest text-dark-700 mb-4">Do you support this candidate?</p>

      <div className="grid grid-cols-2 gap-4">
        {/* YES button */}
        <button
          onClick={() => onSelect(candidate.id)}
          className="py-5 rounded-2xl font-black text-lg uppercase tracking-widest transition-all duration-200"
          style={{
            background: votedYes ? '#00ff88' : 'transparent',
            color: votedYes ? '#000' : '#00ff88',
            border: `2px solid ${votedYes ? '#00ff88' : 'rgba(0,255,136,0.3)'}`,
            boxShadow: votedYes ? '0 0 24px rgba(0,255,136,0.4)' : 'none',
            transform: votedYes ? 'scale(1.02)' : 'scale(1)',
          }}
        >
          {votedYes ? '✓ YES' : 'YES'}
        </button>

        {/* NO button */}
        <button
          onClick={() => onSelect(`NO_${candidate.id}`)}
          className="py-5 rounded-2xl font-black text-lg uppercase tracking-widest transition-all duration-200"
          style={{
            background: votedNo ? '#ff4444' : 'transparent',
            color: votedNo ? '#fff' : '#ff4444',
            border: `2px solid ${votedNo ? '#ff4444' : 'rgba(255,68,68,0.3)'}`,
            boxShadow: votedNo ? '0 0 24px rgba(255,68,68,0.3)' : 'none',
            transform: votedNo ? 'scale(1.02)' : 'scale(1)',
          }}
        >
          {votedNo ? '✗ NO' : 'NO'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// CANDIDATE CARD COMPONENT
// ============================================================

function CandidateCard({ candidate, isSelected, onSelect }: {
  candidate: Candidate;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`candidate-card card text-left p-4 w-full transition-all cursor-pointer ${isSelected ? 'selected' : ''}`}
      style={{ borderColor: isSelected ? '#00ff88' : undefined }}
    >
      {/* Candidate image */}
      <div className="w-full aspect-square rounded-xl mb-3 overflow-hidden bg-dark-400 relative">
        {candidate.imageUrl ? (
          <img src={candidate.imageUrl} alt={candidate.fullName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className="w-10 h-10 text-dark-600" />
          </div>
        )}
        {isSelected && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,255,136,0.3)' }}>
            <CheckCircle className="w-10 h-10" style={{ color: '#00ff88' }} />
          </div>
        )}
      </div>

      {/* Radio indicator */}
      <div className="flex items-start gap-2">
        <div className="w-4 h-4 rounded-full border flex-shrink-0 mt-0.5 transition-all"
          style={{
            borderColor: isSelected ? '#00ff88' : '#333',
            background: isSelected ? '#00ff88' : 'transparent',
            boxShadow: isSelected ? '0 0 6px rgba(0,255,136,0.5)' : 'none'
          }} />
        <div>
          <p className="font-bold text-sm text-white leading-tight">{candidate.fullName}</p>
          {candidate.program && (
            <p className="text-xs text-dark-800 mt-0.5">{candidate.program}</p>
          )}
          {candidate.level && (
            <p className="text-xs text-dark-700">Level {candidate.level}</p>
          )}
        </div>
      </div>
    </button>
  );
}

// ============================================================
// STATUS SCREEN COMPONENT
// ============================================================

function StatusScreen({ icon, title, message, startTime, onLogout, user, showResults, showLive, electionId }: any) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-dark flex flex-col items-center justify-center p-4">
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="max-w-md w-full text-center relative z-10 animate-fade-in">
        <div className="text-6xl mb-6">{icon}</div>
        <h1 className="text-2xl font-black uppercase tracking-widest mb-4" style={{ fontFamily: 'var(--font-orbitron)', color: '#00ff88' }}>
          {title}
        </h1>
        <p className="text-dark-800 mb-4">{message}</p>

        {startTime && (
          <p className="text-xs text-dark-700 mb-8">
            Opens: {new Date(startTime).toLocaleString()}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {showLive && (
            <button onClick={() => router.push('/student/live')} className="btn-primary w-full">
              <BarChart2 className="w-4 h-4" /> Watch Live Scores
            </button>
          )}
          {showResults && (
            <button onClick={() => router.push('/results')} className="btn-primary w-full">
              View Results
            </button>
          )}
          <button
            onClick={() => router.push('/student/support')}
            className="btn-secondary w-full"
          >
            <HelpCircle className="w-4 h-4" /> Contact Support
          </button>
          <button onClick={onLogout} className="btn-secondary w-full">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>

        {user && (
          <p className="text-xs text-dark-700 mt-8">
            Signed in as {user.fullName} · {user.referenceNumber}
          </p>
        )}
      </div>
    </div>
  );
}
