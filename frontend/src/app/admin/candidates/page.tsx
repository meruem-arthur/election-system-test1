'use client';
import { useState, useEffect } from 'react';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, CheckCircle, User, X, Upload, Pencil, Trash2 } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';

const EMPTY_CANDIDATE = {
  fullName: '', indexNumber: '', program: '', level: '',
  bio: '', positionId: '', displayOrder: '0', image: null as File | null
};
const EMPTY_POSITION = { title: '', description: '', displayOrder: '0' };

export default function AdminCandidatesPage() {
  const [elections, setElections] = useState<any[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [positions, setPositions] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Candidate modal state
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<any | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [candidateForm, setCandidateForm] = useState({ ...EMPTY_CANDIDATE });
  const [submittingCandidate, setSubmittingCandidate] = useState(false);

  // Position modal state
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState<any | null>(null);
  const [positionForm, setPositionForm] = useState({ ...EMPTY_POSITION });
  const [submittingPosition, setSubmittingPosition] = useState(false);

  useEffect(() => {
    adminAPI.getElections().then(({ data }) => {
      setElections(data);
      if (data.length > 0) setSelectedElectionId(data[data.length - 1].id);
    });
  }, []);

  useEffect(() => {
    if (selectedElectionId) loadData();
  }, [selectedElectionId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [posRes, candRes] = await Promise.all([
        adminAPI.getPositions(selectedElectionId),
        adminAPI.getCandidates(selectedElectionId)
      ]);
      setPositions(posRes.data);
      setCandidates(candRes.data);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // ---- POSITION ACTIONS ----

  const openAddPosition = () => {
    setEditingPosition(null);
    setPositionForm({ ...EMPTY_POSITION });
    setShowPositionModal(true);
  };

  const openEditPosition = (pos: any) => {
    setEditingPosition(pos);
    setPositionForm({ title: pos.title, description: pos.description || '', displayOrder: String(pos.display_order) });
    setShowPositionModal(true);
  };

  const savePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingPosition(true);
    try {
      const payload = {
        title: positionForm.title,
        description: positionForm.description,
        displayOrder: parseInt(positionForm.displayOrder)
      };
      if (editingPosition) {
        await adminAPI.updatePosition(editingPosition.id, payload);
        toast.success('Position updated');
      } else {
        await adminAPI.createPosition(selectedElectionId, payload);
        toast.success('Position added');
      }
      setShowPositionModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save position');
    } finally {
      setSubmittingPosition(false);
    }
  };

  const deletePosition = async (pos: any) => {
    if (!confirm(`Delete position "${pos.title}"? This cannot be undone.`)) return;
    try {
      await adminAPI.deletePosition(selectedElectionId, pos.id);
      toast.success('Position deleted');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete position');
    }
  };

  // ---- CANDIDATE ACTIONS ----

  const openAddCandidate = (defaultPositionId = '') => {
    setEditingCandidate(null);
    setCandidateForm({ ...EMPTY_CANDIDATE, positionId: defaultPositionId });
    setImagePreview(null);
    setShowCandidateModal(true);
  };

  const openEditCandidate = (candidate: any) => {
    setEditingCandidate(candidate);
    setCandidateForm({
      fullName: candidate.full_name,
      indexNumber: candidate.index_number || '',
      program: candidate.program || '',
      level: candidate.level || '',
      bio: candidate.bio || '',
      positionId: candidate.position_id,
      displayOrder: String(candidate.display_order),
      image: null
    });
    setImagePreview(candidate.image_url || null);
    setShowCandidateModal(true);
  };

  const saveCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateForm.positionId) return toast.error('Select a position');
    setSubmittingCandidate(true);

    try {
      const formData = new FormData();
      formData.append('fullName', candidateForm.fullName);
      formData.append('indexNumber', candidateForm.indexNumber);
      formData.append('program', candidateForm.program);
      formData.append('level', candidateForm.level);
      formData.append('bio', candidateForm.bio);
      formData.append('positionId', candidateForm.positionId);
      formData.append('displayOrder', candidateForm.displayOrder);
      if (candidateForm.image) formData.append('image', candidateForm.image);

      if (editingCandidate) {
        await adminAPI.updateCandidate(editingCandidate.id, formData);
        toast.success('Candidate updated');
      } else {
        await adminAPI.addCandidate(selectedElectionId, formData);
        toast.success('Candidate added');
      }
      setShowCandidateModal(false);
      setImagePreview(null);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save candidate');
    } finally {
      setSubmittingCandidate(false);
    }
  };

  const deleteCandidate = async (candidate: any) => {
    if (!confirm(`Delete candidate "${candidate.full_name}"? This cannot be undone.`)) return;
    try {
      await adminAPI.deleteCandidate(candidate.id);
      toast.success('Candidate deleted');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete candidate');
    }
  };

  const approveCandidate = async (candidateId: string) => {
    try {
      await adminAPI.approveCandidate(candidateId);
      toast.success('Candidate approved');
      loadData();
    } catch {
      toast.error('Failed to approve candidate');
    }
  };

  const handleImageChange = (file: File | null) => {
    setCandidateForm(f => ({ ...f, image: file }));
    if (file) {
      const reader = new FileReader();
      reader.onload = e => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  const byPosition = positions.map(pos => ({
    ...pos,
    candidates: candidates.filter(c => c.position_id === pos.id)
  }));

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-primary-500" style={{ fontFamily: 'var(--font-orbitron)' }}>
            Candidates
          </h1>
          <p className="text-dark-800 text-sm mt-1">Manage positions and candidates</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openAddPosition} className="btn-secondary py-2 px-4 text-sm">
            <Plus className="w-4 h-4" /> Add Position
          </button>
          <button onClick={() => openAddCandidate()} className="btn-primary py-2 px-4 text-sm">
            <Plus className="w-4 h-4" /> Add Candidate
          </button>
        </div>
      </div>

      {/* Election selector */}
      <div className="card-glow p-4 mb-6 flex items-center gap-4">
        <label className="text-sm text-dark-700 whitespace-nowrap">Election:</label>
        <select value={selectedElectionId} onChange={e => setSelectedElectionId(e.target.value)} className="input flex-1 py-2 text-sm">
          {elections.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
      </div>

      {/* Candidates grouped by position */}
      {loading ? (
        <div className="text-center py-12"><div className="spinner mx-auto" /></div>
      ) : byPosition.length === 0 ? (
        <div className="card-glow p-16 text-center">
          <p className="text-dark-700 mb-4">No positions created yet</p>
          <button onClick={openAddPosition} className="btn-primary">
            <Plus className="w-4 h-4" /> Add First Position
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {byPosition.map(position => (
            <div key={position.id}>
              {/* Position header with edit/delete */}
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-black uppercase tracking-widest text-white" style={{ fontFamily: 'var(--font-orbitron)' }}>
                  {position.title}
                </h2>
                <span className="text-xs text-dark-700">{position.candidates.length} candidate(s)</span>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => openEditPosition(position)}
                    className="p-1.5 rounded-lg text-dark-700 hover:text-primary-500 hover:bg-dark-400 transition-colors"
                    title="Edit position"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deletePosition(position)}
                    className="p-1.5 rounded-lg text-dark-700 hover:text-red-400 hover:bg-dark-400 transition-colors"
                    title="Delete position"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {position.candidates.map((candidate: any) => (
                  <div key={candidate.id} className="card-glow p-4 relative group">
                    {/* Edit/Delete buttons on hover */}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button
                        onClick={() => openEditCandidate(candidate)}
                        className="p-1 rounded-lg bg-dark-300 text-dark-700 hover:text-primary-500 transition-colors"
                        title="Edit candidate"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteCandidate(candidate)}
                        className="p-1 rounded-lg bg-dark-300 text-dark-700 hover:text-red-400 transition-colors"
                        title="Delete candidate"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="w-full aspect-square rounded-xl mb-3 overflow-hidden bg-dark-400">
                      {candidate.image_url ? (
                        <img src={candidate.image_url} alt={candidate.full_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="w-10 h-10 text-dark-600" />
                        </div>
                      )}
                    </div>
                    <p className="font-bold text-white text-sm">{candidate.full_name}</p>
                    <p className="text-xs text-dark-700 mb-3">{candidate.program}</p>

                    {candidate.is_approved ? (
                      <div className="flex items-center gap-1 text-xs text-primary-500">
                        <CheckCircle className="w-3 h-3" /> Approved
                      </div>
                    ) : (
                      <button
                        onClick={() => approveCandidate(candidate.id)}
                        className="btn-primary w-full py-1.5 text-xs"
                      >
                        Approve
                      </button>
                    )}
                  </div>
                ))}

                {/* Add candidate shortcut */}
                <button
                  onClick={() => openAddCandidate(position.id)}
                  className="card border-dashed border-dark-600 p-4 flex flex-col items-center justify-center gap-2 hover:border-primary-500/50 transition-colors min-h-48"
                >
                  <Plus className="w-8 h-8 text-dark-600" />
                  <span className="text-xs text-dark-700">Add Candidate</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Position Modal (Add / Edit) */}
      {showPositionModal && (
        <Modal title={editingPosition ? 'Edit Position' : 'Add Position'} onClose={() => setShowPositionModal(false)}>
          <form onSubmit={savePosition} className="space-y-4">
            <div>
              <label className="label">Position Title *</label>
              <input className="input" placeholder="e.g. President" value={positionForm.title}
                onChange={e => setPositionForm(f => ({ ...f, title: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input" rows={3} placeholder="Optional description"
                value={positionForm.description}
                onChange={e => setPositionForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label className="label">Display Order</label>
              <input type="number" className="input" value={positionForm.displayOrder}
                onChange={e => setPositionForm(f => ({ ...f, displayOrder: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowPositionModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={submittingPosition} className="btn-primary flex-1">
                {submittingPosition ? <div className="spinner" /> : (editingPosition ? 'Save Changes' : 'Add Position')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Candidate Modal (Add / Edit) */}
      {showCandidateModal && (
        <Modal title={editingCandidate ? 'Edit Candidate' : 'Add Candidate'} onClose={() => { setShowCandidateModal(false); setImagePreview(null); }}>
          <form onSubmit={saveCandidate} className="space-y-4">
            {/* Image upload */}
            <div>
              <label className="label">Candidate Photo</label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-dark-400 flex-shrink-0">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="w-8 h-8 text-dark-600" />
                    </div>
                  )}
                </div>
                <label className="btn-secondary cursor-pointer">
                  <Upload className="w-4 h-4" /> {editingCandidate ? 'Change Photo' : 'Upload Photo'}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => handleImageChange(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>

            <div>
              <label className="label">Full Name *</label>
              <input className="input" placeholder="Candidate full name" value={candidateForm.fullName}
                onChange={e => setCandidateForm(f => ({ ...f, fullName: e.target.value }))} required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Index Number</label>
                <input className="input text-xs" placeholder="SRI.41.003.019.23" value={candidateForm.indexNumber}
                  onChange={e => setCandidateForm(f => ({ ...f, indexNumber: e.target.value }))} />
              </div>
              <div>
                <label className="label">Level</label>
                <input className="input" placeholder="300" value={candidateForm.level}
                  onChange={e => setCandidateForm(f => ({ ...f, level: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="label">Program</label>
              <input className="input" placeholder="BSc Computer Science" value={candidateForm.program}
                onChange={e => setCandidateForm(f => ({ ...f, program: e.target.value }))} />
            </div>

            <div>
              <label className="label">Position *</label>
              <select className="input" value={candidateForm.positionId}
                onChange={e => setCandidateForm(f => ({ ...f, positionId: e.target.value }))} required>
                <option value="">Select position...</option>
                {positions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Short Bio</label>
              <textarea className="input" rows={3} placeholder="Brief candidate bio..."
                value={candidateForm.bio}
                onChange={e => setCandidateForm(f => ({ ...f, bio: e.target.value }))} />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setShowCandidateModal(false); setImagePreview(null); }} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={submittingCandidate} className="btn-primary flex-1">
                {submittingCandidate ? <div className="spinner" /> : (editingCandidate ? 'Save Changes' : 'Add Candidate')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </AdminLayout>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative card-glow p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-white text-lg">{title}</h3>
          <button onClick={onClose} className="p-1 text-dark-700 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
