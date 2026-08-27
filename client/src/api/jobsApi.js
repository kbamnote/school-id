import api from './client';

/** MR Print World production endpoints. Platform staff only. */
export const jobsApi = {
  list: (params) => api.get('/super-admin/jobs', { params }).then((r) => r.data),
  stats: () => api.get('/super-admin/jobs/stats').then((r) => r.data.data),
  pipeline: () => api.get('/super-admin/jobs/pipeline').then((r) => r.data.data.stages),
  operators: () => api.get('/super-admin/jobs/operators').then((r) => r.data.data.operators),

  get: (id) => api.get(`/super-admin/jobs/${id}`).then((r) => r.data.data),

  update: (id, payload) => api.patch(`/super-admin/jobs/${id}`, payload).then((r) => r.data.data.job),
  setStatus: (id, status, note) =>
    api.patch(`/super-admin/jobs/${id}/status`, { status, note }).then((r) => r.data),
  assign: (id, assignedTo) =>
    api.patch(`/super-admin/jobs/${id}/assign`, { assignedTo }).then((r) => r.data),
  raiseDataIssue: (id, payload) =>
    api.post(`/super-admin/jobs/${id}/data-issue`, payload).then((r) => r.data),
};

export default jobsApi;
