import api from './client';

/** Card layouts: artwork, positioned elements and the print-accurate render. */
export const cardDesignsApi = {
  list: (params) => api.get('/card-designs', { params }).then((r) => r.data),
  get: (id) => api.get(`/card-designs/${id}`).then((r) => r.data.data),
  fonts: () => api.get('/card-designs/fonts').then((r) => r.data.data.fonts),

  create: (payload) => api.post('/card-designs', payload).then((r) => r.data.data),
  update: (id, payload) => api.patch(`/card-designs/${id}`, payload).then((r) => r.data.data),
  setStatus: (id, status) =>
    api.post(`/card-designs/${id}/status`, { status }).then((r) => r.data.data),
  remove: (id) => api.delete(`/card-designs/${id}`).then((r) => r.data),

  uploadArtwork: (id, file, face = 'front') => {
    const form = new FormData();
    form.append('artwork', file);
    form.append('face', face);
    return api
      .post(`/card-designs/${id}/artwork`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data);
  },
  removeArtwork: (id, face) =>
    api.delete(`/card-designs/${id}/artwork/${face}`).then((r) => r.data.data),

  /**
   * The server-rendered card, as an object URL.
   *
   * The caller owns the URL and must revokeObjectURL it - these are full-size
   * PNGs and leaking one per keystroke would be expensive.
   */
  previewUrl: async (id, { submission, face } = {}) => {
    const response = await api.get(`/card-designs/${id}/preview`, {
      params: { submission, face },
      responseType: 'blob',
    });
    return URL.createObjectURL(response.data);
  },
};

/** The end user's own view: the active layout, and their finished card. */
export const portalCardApi = {
  designForForm: (formId) =>
    api.get(`/portal/forms/${formId}/card-design`).then((r) => r.data.data.design),
  myCardUrl: async (submissionId, face = 'front') => {
    const response = await api.get(`/portal/submissions/${submissionId}/card`, {
      params: { face },
      responseType: 'blob',
    });
    return URL.createObjectURL(response.data);
  },
};

export default cardDesignsApi;
