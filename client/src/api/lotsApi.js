import api from './client';

export const lotsApi = {
  eligible: (params) => api.get('/lots/eligible', { params }).then((r) => r.data),
  validate: (submissions, form) =>
    api.post('/lots/validate', { submissions, form }).then((r) => r.data.data),

  list: (params) => api.get('/lots', { params }).then((r) => r.data),
  stats: () => api.get('/lots/stats').then((r) => r.data.data),
  get: (id) => api.get(`/lots/${id}`).then((r) => r.data.data),

  create: (payload) => api.post('/lots', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/lots/${id}`, payload).then((r) => r.data.data.lot),
  markReady: (id) => api.patch(`/lots/${id}/ready`).then((r) => r.data.data.lot),

  addRecords: (id, submissions) =>
    api.post(`/lots/${id}/records`, { submissions }).then((r) => r.data),
  removeRecords: (id, submissions) =>
    api.delete(`/lots/${id}/records`, { data: { submissions } }).then((r) => r.data),

  submit: (id, force = false) => api.post(`/lots/${id}/submit`, { force }).then((r) => r.data),
  cancel: (id, reason) => api.post(`/lots/${id}/cancel`, { reason }).then((r) => r.data),
};

export default lotsApi;
