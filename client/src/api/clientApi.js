import api from './client';

/** Tenant-scoped endpoints. The server derives the tenant from the token. */

export const clientDashboardApi = {
  summary: () => api.get('/dashboard').then((r) => r.data.data),
};

export const categoriesApi = {
  list: (params) => api.get('/categories', { params }).then((r) => r.data),
  get: (id) => api.get(`/categories/${id}`).then((r) => r.data.data),
  create: (payload) => api.post('/categories', payload).then((r) => r.data.data.category),
  update: (id, payload) => api.patch(`/categories/${id}`, payload).then((r) => r.data.data.category),
  remove: (id) => api.delete(`/categories/${id}`).then((r) => r.data),
};

export const departmentsApi = {
  list: (params) => api.get('/departments', { params }).then((r) => r.data),
  tree: () => api.get('/departments/tree').then((r) => r.data.data.departments),
  get: (id) => api.get(`/departments/${id}`).then((r) => r.data.data),
  create: (payload) => api.post('/departments', payload).then((r) => r.data.data.department),
  update: (id, payload) => api.patch(`/departments/${id}`, payload).then((r) => r.data.data.department),
  remove: (id) => api.delete(`/departments/${id}`).then((r) => r.data),
};

export const usersApi = {
  list: (params) => api.get('/users', { params }).then((r) => r.data),
  stats: () => api.get('/users/stats').then((r) => r.data.data),
  get: (id) => api.get(`/users/${id}`).then((r) => r.data.data.user),
  assignableRoles: () => api.get('/users/assignable-roles').then((r) => r.data.data.roles),
  create: (payload) => api.post('/users', payload).then((r) => r.data.data),
  update: (id, payload) => api.patch(`/users/${id}`, payload).then((r) => r.data.data.user),
  setStatus: (id, status) => api.patch(`/users/${id}/status`, { status }).then((r) => r.data.data.user),
  resetPassword: (id) =>
    api.post(`/users/${id}/reset-password`).then((r) => r.data.data.credentials),
  remove: (id) => api.delete(`/users/${id}`).then((r) => r.data),

  parseImport: (file, mapping) => {
    const form = new FormData();
    form.append('file', file);
    if (mapping) form.append('mapping', JSON.stringify(mapping));
    return api
      .post('/users/import/parse', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data.data);
  },

  commitImport: (rows) => api.post('/users/import/commit', { rows }).then((r) => r.data.data),

  /**
   * Downloads stream through axios as a blob rather than a plain link, so the
   * Authorization header is attached - these endpoints are not public.
   */
  downloadTemplate: () =>
    api
      .get('/users/import/template', { responseType: 'blob' })
      .then((r) => saveBlob(r.data, 'user-import-template.xlsx')),

  export: (params) =>
    api
      .get('/users/export', { params, responseType: 'blob' })
      .then((r) => saveBlob(r.data, params?.format === 'csv' ? 'users.csv' : 'users.xlsx')),
};

/** Triggers a browser download for a blob response. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick so the download has started before the URL dies.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
