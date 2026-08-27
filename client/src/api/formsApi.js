import api from './client';

export const formsApi = {
  fieldTypes: () => api.get('/forms/field-types').then((r) => r.data.data),

  list: (params) => api.get('/forms', { params }).then((r) => r.data),
  get: (id) => api.get(`/forms/${id}`).then((r) => r.data.data),

  create: (payload) => api.post('/forms', payload).then((r) => r.data.data.form),
  update: (id, payload) => api.patch(`/forms/${id}`, payload).then((r) => r.data.data.form),
  setStatus: (id, status) =>
    api.patch(`/forms/${id}/status`, { status }).then((r) => r.data.data.form),
  duplicate: (id) => api.post(`/forms/${id}/duplicate`).then((r) => r.data.data.form),
  remove: (id) => api.delete(`/forms/${id}`).then((r) => r.data),

  manageLink: (id, action) => api.post(`/forms/${id}/link`, { action }).then((r) => r.data.data),

  assign: (id, payload) => api.post(`/forms/${id}/assignments`, payload).then((r) => r.data.data),
  unassign: (id, assignmentId) =>
    api.delete(`/forms/${id}/assignments/${assignmentId}`).then((r) => r.data.data),
  assignees: (id, params) => api.get(`/forms/${id}/assignees`, { params }).then((r) => r.data),
};

export default formsApi;
