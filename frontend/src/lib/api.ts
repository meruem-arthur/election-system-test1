// src/lib/api.ts
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Auto-attach token
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('token')
    : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('userType');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// ============================================================
// AUTH API
// ============================================================

export const authAPI = {
  studentLogin: (referenceNumber: string, password: string) =>
    api.post('/auth/student/login', { referenceNumber, password }),

  changePassword: (newPassword: string) =>
    api.post('/auth/student/change-password', { newPassword }),

  verifyOTP: (code: string) =>
    api.post('/auth/student/verify-otp', { code }),

  resendOTP: () => api.post('/auth/student/resend-otp'),

  checkVerificationStatus: () => api.get('/auth/student/verification-status'),

  adminLogin: (email: string, password: string) =>
    api.post('/auth/admin/login', { email, password }),

  getStudentProfile: () => api.get('/auth/student/me'),
  getAdminProfile: () => api.get('/auth/admin/me'),
};

// ============================================================
// VOTE API
// ============================================================

export const voteAPI = {
  getCandidates: () => api.get('/vote/candidates'),

  castVote: (votes: Array<{ positionId: string; candidateId: string }>) =>
    api.post('/vote/cast', { votes }),

  getLiveScores: () => api.get('/vote/live'),
};

// ============================================================
// ADMIN API
// ============================================================

export const adminAPI = {
  getDashboard: (electionId: string) =>
    api.get(`/admin/dashboard/${electionId}`),

  getElections: () => api.get('/admin/elections'),

  createElection: (data: any) => api.post('/admin/elections', data),

  updateElectionStatus: (id: string, status: string) =>
    api.patch(`/admin/elections/${id}/status`, { status }),

  deleteElection: (id: string) =>
    api.delete(`/admin/elections/${id}`),

  deleteAllElections: () =>
    api.delete('/admin/elections'),

  getPositions: (electionId: string) =>
    api.get(`/admin/elections/${electionId}/positions`),

  createPosition: (electionId: string, data: any) =>
    api.post(`/admin/elections/${electionId}/positions`, data),

  getCandidates: (electionId: string) =>
    api.get(`/admin/elections/${electionId}/candidates`),

  addCandidate: (electionId: string, formData: FormData) =>
    api.post(`/admin/elections/${electionId}/candidates`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  approveCandidate: (candidateId: string) =>
    api.patch(`/admin/candidates/${candidateId}/approve`),

  updateCandidate: (candidateId: string, formData: FormData) =>
    api.put(`/admin/candidates/${candidateId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  updatePosition: (positionId: string, data: any) =>
    api.put(`/admin/positions/${positionId}`, data),

  deleteCandidate: (candidateId: string) =>
    api.delete(`/admin/candidates/${candidateId}`),

  deleteAllCandidates: (electionId: string) =>
    api.delete(`/admin/elections/${electionId}/candidates`),

  deletePositionCandidates: (electionId: string, positionId: string) =>
    api.delete(`/admin/elections/${electionId}/positions/${positionId}/candidates`),

  deletePosition: (electionId: string, positionId: string) =>
    api.delete(`/admin/elections/${electionId}/positions/${positionId}`),

  deleteAllPositions: (electionId: string) =>
    api.delete(`/admin/elections/${electionId}/positions`),

  getStudents: (electionId: string, params?: any) =>
    api.get(`/admin/elections/${electionId}/students`, { params }),

  uploadCSV: (electionId: string, file: File) => {
    const formData = new FormData();
    formData.append('csv', file);
    return api.post(`/admin/elections/${electionId}/students/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getAdmins: () => api.get('/admin/admins'),

  createAdmin: (data: any) => api.post('/admin/admins', data),

  unlockStudent: (studentId: string) =>
    api.patch(`/admin/students/${studentId}/unlock`),

  verifyStudent: (studentId: string) =>
    api.patch(`/admin/students/${studentId}/verify`),

  updateStudentContact: (studentId: string, data: { phoneNumber: string; schoolEmail: string }) =>
    api.patch(`/admin/students/${studentId}/contact`, data),

  deleteStudent: (studentId: string) =>
    api.delete(`/admin/students/${studentId}`),

  deleteAllStudents: (electionId: string) =>
    api.delete(`/admin/elections/${electionId}/students`),
};

// ============================================================
// CREDENTIAL DISPATCH API
// ============================================================

export const credentialDispatchAPI = {
  // Queue credential generation + send for students who haven't set a
  // password yet. Omit studentIds to target the whole election.
  regenerateBulk: (electionId: string, studentIds?: string[]) =>
    api.post(`/admin/elections/${electionId}/students/regenerate-credentials-bulk`, {
      studentIds: studentIds && studentIds.length > 0 ? studentIds : undefined,
    }),

  getStatus: (electionId: string) =>
    api.get(`/admin/elections/${electionId}/credential-dispatch`),

  // Omit studentIds to retry everyone currently failed.
  resendFailed: (electionId: string, studentIds?: string[]) =>
    api.post(`/admin/elections/${electionId}/credential-dispatch/resend-failed`, {
      studentIds: studentIds && studentIds.length > 0 ? studentIds : undefined,
    }),
};

// ============================================================
// RESULTS API
// ============================================================

export const resultsAPI = {
  getPublishedElections: () => api.get('/results/published'),

  getResults: (electionId: string) =>
    api.get(`/results/${electionId}`),

  downloadPDF: (electionId: string) =>
    api.get(`/results/${electionId}/pdf`, { responseType: 'blob' }),
};

// ============================================================
// AUDIT API
// ============================================================

export const auditAPI = {
  getLogs: (params?: any) => api.get('/audit', { params }),
};

// ============================================================
// SUPPORT API
// ============================================================

export const supportAPI = {
  createTicket: (data: any) => api.post('/support', data),
  getMyTickets: () => api.get('/support/my'),
  getAdminTickets: () => api.get('/support/admin'),
  updateTicket: (id: string, data: any) => api.patch(`/support/${id}`, data),
};

export default api;
