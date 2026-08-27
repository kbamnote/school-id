import api from './client';

/** Client-side: reviewing and signing off proofs. */
export const proofsApi = {
  list: (params) => api.get('/proofs', { params }).then((r) => r.data),
  get: (id) => api.get(`/proofs/${id}`).then((r) => r.data.data),
  decide: (id, decision, comment) =>
    api.post(`/proofs/${id}/decision`, { decision, comment }).then((r) => r.data),
};

/** MR Print World side: producing and sending proofs. */
export const platformProofsApi = {
  list: (params) => api.get('/super-admin/proofs', { params }).then((r) => r.data),
  forJob: (jobId) => api.get(`/super-admin/jobs/${jobId}/proofs`).then((r) => r.data.data.proofs),
  upload: (jobId, file, notes) => {
    const form = new FormData();
    form.append('file', file);
    if (notes) form.append('notes', notes);
    return api
      .post(`/super-admin/jobs/${jobId}/proofs`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
};

export default proofsApi;
