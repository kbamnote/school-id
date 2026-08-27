import api from './client';

export const submissionsApi = {
  list: (params) => api.get('/submissions', { params }).then((r) => r.data),
  stats: (params) => api.get('/submissions/stats', { params }).then((r) => r.data.data),
  get: (id) => api.get(`/submissions/${id}`).then((r) => r.data.data),

  approve: (id, note) =>
    api.post(`/submissions/${id}/approve`, { note }).then((r) => r.data),

  requestCorrection: (id, payload) =>
    api.post(`/submissions/${id}/request-correction`, payload).then((r) => r.data),

  reject: (id, note) => api.post(`/submissions/${id}/reject`, { note }).then((r) => r.data),

  editData: (id, data, note) =>
    api.patch(`/submissions/${id}/data`, { data, note }).then((r) => r.data),

  bulk: (ids, action, note) =>
    api.post('/submissions/bulk', { ids, action, note }).then((r) => r.data),

  dismissDuplicate: (id) =>
    api.post(`/submissions/${id}/dismiss-duplicate`).then((r) => r.data),
};

export default submissionsApi;
