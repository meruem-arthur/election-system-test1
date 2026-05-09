'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';
import { Upload, Search, Users, CheckCircle, XCircle, ChevronLeft, ChevronRight, Unlock, RefreshCw, Trash2, Pencil } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';

export default function AdminStudentsPage() {
  const [elections, setElections] = useState<any[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [filterVoted, setFilterVoted] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  const selectedElectionRef = useRef('');
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState<any>(null);
  const [editContact, setEditContact] = useState<any>(null);
  const [editContactForm, setEditContactForm] = useState({ phoneNumber: '', schoolEmail: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);

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
    if (selectedElectionId) loadStudents(selectedElectionId);
  }, [selectedElectionId, page, search, filterVoted, filterLevel]);

  const loadStudents = async (electionId?: string) => {
    const id = electionId || selectedElectionRef.current;
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await adminAPI.getStudents(id, {
        page, limit: 50, search: search || undefined,
        hasVoted: filterVoted || undefined,
        level: filterLevel || undefined
      });
      setStudents(data.students);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const currentElectionId = selectedElectionRef.current;
    if (!currentElectionId) return toast.error('Select an election first');
    const file = acceptedFiles[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) return toast.error('Please upload a CSV file');

    setUploading(true);
    setUploadResult(null);
    try {
      const { data } = await adminAPI.uploadCSV(currentElectionId, file);
      setUploadResult(data);
      toast.success(`${data.inserted} students uploaded successfully`);
      // Reload using the current election ID directly
      setTimeout(() => loadStudents(currentElectionId), 800);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    disabled: uploading
  });

  const unlockStudent = async (studentId: string) => {
    try {
      await adminAPI.unlockStudent(studentId);
      toast.success('Account unlocked');
      loadStudents();
    } catch {
      toast.error('Failed to unlock account');
    }
  };

  const verifyStudent = async (studentId: string, studentName: string) => {
    try {
      await adminAPI.verifyStudent(studentId);
      toast.success(`${studentName} manually verified — can now log in without OTP`);
      loadStudents();
    } catch {
      toast.error('Failed to verify student');
    }
  };

  const openEditContact = (s: any) => {
    setEditContact(s);
    setEditContactForm({
      phoneNumber: s.phone_number || '',
      schoolEmail: s.school_email || ''
    });
  };

  const saveEditContact = async () => {
    if (!editContact) return;
    setEditSubmitting(true);
    try {
      await adminAPI.updateStudentContact(editContact.id, editContactForm);
      toast.success('Contact details updated');
      setEditContact(null);
      loadStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update contact');
    } finally {
      setEditSubmitting(false);
    }
  };

  const deleteStudent = async (student: any) => {
    try {
      await adminAPI.deleteStudent(student.id);
      toast.success(`${student.full_name} removed`);
      setConfirmDeleteStudent(null);
      loadStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete student');
    }
  };

  const deleteAllStudents = async () => {
    try {
      await adminAPI.deleteAllStudents(selectedElectionRef.current);
      toast.success('All students removed from this election');
      setConfirmDeleteAll(false);
      loadStudents();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete students');
    }
  };

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-primary-500" style={{ fontFamily: 'var(--font-orbitron)' }}>
            Student Management
          </h1>
          <p className="text-dark-800 text-sm mt-1">Upload and manage verified student records</p>
        </div>
        {total > 0 && (
          <button
            onClick={() => setConfirmDeleteAll(true)}
            className="btn-danger py-2 px-4 text-sm flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Delete All Students
          </button>
        )}
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

      {/* CSV Upload */}
      <div className="card-glow p-6 mb-6">
        <h2 className="font-bold text-white mb-1">Upload Student Records</h2>
        <p className="text-xs text-dark-700 mb-4">
          CSV must include: Full Name, Surname, Index Number, Reference Number, Level, Department, Program
          (Phone Number and School Email are optional but required for OTP)
        </p>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            isDragActive
              ? 'border-primary-500 bg-primary-500/5'
              : 'border-dark-500 hover:border-primary-500/50'
          } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="spinner" style={{ width: 32, height: 32 }} />
              <p className="text-sm text-dark-800">Processing CSV...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="w-10 h-10 text-dark-700" />
              <p className="text-sm text-white">
                {isDragActive ? 'Drop CSV here' : 'Drag & drop CSV file here, or click to browse'}
              </p>
              <p className="text-xs text-dark-700">Maximum 10MB · .csv files only</p>
            </div>
          )}
        </div>

        {/* Upload result */}
        {uploadResult && (
          <div className="mt-4 rounded-xl p-4" style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)' }}>
            <p className="font-semibold text-white mb-2">Upload Complete</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><span className="text-dark-700">Total rows:</span> <span className="text-white font-mono">{uploadResult.total}</span></div>
              <div><span className="text-dark-700">Inserted:</span> <span className="text-primary-500 font-mono">{uploadResult.inserted}</span></div>
              <div><span className="text-dark-700">Duplicates:</span> <span className="text-yellow-400 font-mono">{uploadResult.duplicates}</span></div>
              <div><span className="text-dark-700">Errors:</span> <span className="text-red-400 font-mono">{uploadResult.errors}</span></div>
            </div>
            {uploadResult.errorDetails?.length > 0 && (
              <div className="mt-3 max-h-32 overflow-y-auto">
                {uploadResult.errorDetails.map((e: any, i: number) => (
                  <p key={i} className="text-xs text-red-400">Row {e.row}: {e.error}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CSV Template download */}
        <div className="mt-3 flex items-center gap-2">
          <button
            className="text-xs text-primary-500 hover:underline"
            onClick={() => {
              const csv = 'Full Name,Surname,Index Number,Reference Number,Level,Department,Program,Phone Number,School Email\nKwame Mensah,Mensah,SRI.41.003.019.23,9013200723,300,Computer Science,BSc Computer Science,0244123456,kmensah@stu.edu.gh';
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'student-template.csv'; a.click();
            }}
          >
            ↓ Download CSV Template
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-700" />
          <input
            type="text"
            className="input pl-9 py-2 text-sm"
            placeholder="Search name, reference, index..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="input py-2 text-sm"
          style={{ width: 'auto' }}
          value={filterVoted}
          onChange={e => { setFilterVoted(e.target.value); setPage(1); }}
        >
          <option value="">All Students</option>
          <option value="true">Voted</option>
          <option value="false">Not Voted</option>
        </select>
        <select
          className="input py-2 text-sm"
          style={{ width: 'auto' }}
          value={filterLevel}
          onChange={e => { setFilterLevel(e.target.value); setPage(1); }}
        >
          <option value="">All Levels</option>
          <option value="100">Level 100</option>
          <option value="200">Level 200</option>
          <option value="300">Level 300</option>
          <option value="400">Level 400</option>
        </select>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 text-sm text-dark-700">
          <Users className="w-4 h-4" />
          <span>{total} total students</span>
        </div>
        <button
          onClick={() => loadStudents()}
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
                <th>Name</th>
                <th>Reference No.</th>
                <th>Index No.</th>
                <th>Level</th>
                <th>Program</th>
                <th>Verified</th>
                <th>Voted</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-dark-700">Loading...</td></tr>
              ) : students.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-dark-700">No students found</td></tr>
              ) : students.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="font-medium text-white">{s.full_name}</div>
                  </td>
                  <td><span className="font-mono text-xs text-primary-500">{s.reference_number}</span></td>
                  <td><span className="font-mono text-xs text-dark-800">{s.index_number}</span></td>
                  <td><span className="text-sm">{s.level}</span></td>
                  <td><span className="text-xs text-dark-800">{s.program}</span></td>
                  <td>
                    {s.is_verified
                      ? <CheckCircle className="w-4 h-4 text-primary-500" />
                      : <XCircle className="w-4 h-4 text-dark-600" />}
                  </td>
                  <td>
                    {s.has_voted
                      ? <span className="badge badge-active text-xs">Voted</span>
                      : <span className="badge badge-draft text-xs">Pending</span>}
                  </td>
                  <td>
                    {s.account_locked
                      ? <span className="badge badge-ended text-xs">Locked</span>
                      : <span className="text-xs text-dark-700">Active</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      {s.account_locked && (
                        <button
                          onClick={() => unlockStudent(s.id)}
                          className="p-1.5 text-primary-500 hover:text-white transition-colors rounded-lg hover:bg-dark-400"
                          title="Unlock account"
                        >
                          <Unlock className="w-4 h-4" />
                        </button>
                      )}
                      {!s.is_verified && (
                        <button
                          onClick={() => verifyStudent(s.id, s.full_name)}
                          className="p-1.5 hover:text-white transition-colors rounded-lg hover:bg-dark-400"
                          style={{ color: '#00ff88' }}
                          title="Manually verify — bypass OTP"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => openEditContact(s)}
                        className="p-1.5 text-dark-600 hover:text-yellow-400 transition-colors rounded-lg hover:bg-dark-400"
                        title="Edit contact details"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteStudent(s)}
                        className="p-1.5 text-dark-600 hover:text-red-400 transition-colors rounded-lg hover:bg-dark-400"
                        title="Delete student"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-dark-500">
            <p className="text-xs text-dark-700">Page {page} of {pages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary py-1 px-3 text-xs"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="btn-secondary py-1 px-3 text-xs"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Contact Modal */}
      {editContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setEditContact(null)} />
          <div className="relative card-glow p-6 w-full max-w-sm">
            <h3 className="font-bold text-white text-lg mb-1">Edit Contact Details</h3>
            <p className="text-xs text-dark-700 mb-5">
              {editContact.full_name} · <span className="font-mono text-primary-500">{editContact.reference_number}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="label">Phone Number</label>
                <input
                  className="input"
                  placeholder="e.g. 0244123456"
                  value={editContactForm.phoneNumber}
                  onChange={e => setEditContactForm(f => ({ ...f, phoneNumber: e.target.value }))}
                />
                <p className="text-xs text-dark-700 mt-1">Used for SMS OTP delivery</p>
              </div>
              <div>
                <label className="label">School Email</label>
                <input
                  className="input"
                  type="email"
                  placeholder="e.g. student@university.edu.gh"
                  value={editContactForm.schoolEmail}
                  onChange={e => setEditContactForm(f => ({ ...f, schoolEmail: e.target.value }))}
                />
                <p className="text-xs text-dark-700 mt-1">Used for email OTP delivery</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditContact(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={saveEditContact}
                disabled={editSubmitting}
                className="btn-primary flex-1"
              >
                {editSubmitting ? <div className="spinner" /> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete ALL Students Modal */}
      {confirmDeleteAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setConfirmDeleteAll(false)} />
          <div className="relative card-glow p-6 w-full max-w-sm text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)' }}>
              <Trash2 className="w-7 h-7" style={{ color: '#ff4444' }} />
            </div>
            <h3 className="font-bold text-white text-lg mb-2">Delete All Students?</h3>
            <p className="text-sm text-dark-700 mb-2">
              This will remove all <span className="text-white font-bold">{total} students</span> from this election.
            </p>
            <p className="text-xs text-dark-700 mb-6">
              Their accounts, OTP records and vote history will all be deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteAll(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={deleteAllStudents}
                className="flex-1 py-2 px-4 rounded-xl font-semibold text-sm"
                style={{ background: '#ff4444', color: '#fff' }}
              >
                Yes, Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Student Modal */}
      {confirmDeleteStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setConfirmDeleteStudent(null)} />
          <div className="relative card-glow p-6 w-full max-w-sm text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)' }}>
              <Trash2 className="w-7 h-7" style={{ color: '#ff4444' }} />
            </div>
            <h3 className="font-bold text-white text-lg mb-2">Remove Student?</h3>
            <p className="text-sm text-white font-semibold mb-1">{confirmDeleteStudent.full_name}</p>
            <p className="text-xs text-dark-700 mb-1">Ref: {confirmDeleteStudent.reference_number}</p>
            <p className="text-xs text-dark-700 mb-6">
              This student will be permanently removed from the election.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteStudent(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={() => deleteStudent(confirmDeleteStudent)}
                className="flex-1 py-2 px-4 rounded-xl font-semibold text-sm"
                style={{ background: '#ff4444', color: '#fff' }}
              >
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}
