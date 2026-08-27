import api from './client';

/**
 * MR Print World platform endpoints.
 *
 * Every list call passes its params straight through to the server - filtering,
 * searching and paging all happen there, never in the browser.
 */

export const dashboardApi = {
  summary: () => api.get('/super-admin/dashboard').then((r) => r.data.data),
};

export const clientsApi = {
  list: (params) =>
    api.get('/super-admin/organizations', { params }).then((r) => r.data),

  stats: () => api.get('/super-admin/organizations/stats').then((r) => r.data.data),

  get: (id) => api.get(`/super-admin/organizations/${id}`).then((r) => r.data.data),

  create: (payload) =>
    api.post('/super-admin/organizations', payload).then((r) => r.data.data),

  update: (id, payload) =>
    api.patch(`/super-admin/organizations/${id}`, payload).then((r) => r.data.data),

  setStatus: (id, status, reason) =>
    api
      .patch(`/super-admin/organizations/${id}/status`, { status, reason })
      .then((r) => r.data.data),

  setSubscription: (id, payload) =>
    api.put(`/super-admin/organizations/${id}/subscription`, payload).then((r) => r.data.data),

  uploadLogo: (id, file) => {
    const form = new FormData();
    form.append('logo', file);
    return api
      .post(`/super-admin/organizations/${id}/logo`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data);
  },
};

export const plansApi = {
  list: (includeInactive = false) =>
    api
      .get('/super-admin/plans', { params: { includeInactive } })
      .then((r) => r.data.data.plans),

  create: (payload) => api.post('/super-admin/plans', payload).then((r) => r.data.data.plan),

  update: (id, payload) =>
    api.patch(`/super-admin/plans/${id}`, payload).then((r) => r.data.data.plan),

  remove: (id) => api.delete(`/super-admin/plans/${id}`).then((r) => r.data),
};
