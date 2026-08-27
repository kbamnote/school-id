import api from './client';

/** End-user portal. Every response is scoped to the signed-in user server-side. */
export const portalApi = {
  myForms: () => api.get('/portal/forms').then((r) => r.data.data),

  getForm: (id) => api.get(`/portal/forms/${id}`).then((r) => r.data.data),

  saveDraft: (id, payload) =>
    api.put(`/portal/forms/${id}/draft`, payload).then((r) => r.data.data),

  submit: (id, payload) =>
    api.post(`/portal/forms/${id}/submit`, payload).then((r) => r.data),

  uploadFile: (id, fieldKey, file) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post(`/portal/forms/${id}/upload/${fieldKey}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data);
  },

  removeFile: (id, fieldKey) =>
    api.delete(`/portal/forms/${id}/upload/${fieldKey}`).then((r) => r.data.data),

  mySubmissions: () => api.get('/portal/submissions').then((r) => r.data.data.submissions),
  mySubmission: (id) => api.get(`/portal/submissions/${id}`).then((r) => r.data.data.submission),
};

export default portalApi;
