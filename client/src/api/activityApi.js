import api from './client';

/** Notifications belong to the signed-in person, whatever portal they are in. */
export const notificationsApi = {
  list: (params) => api.get('/notifications', { params }).then((r) => r.data),
  unreadCount: () =>
    api.get('/notifications/unread-count').then((r) => r.data.data.unread),
  markRead: (id) => api.post(`/notifications/${id}/read`).then((r) => r.data.data),
  markAllRead: () => api.post('/notifications/read-all').then((r) => r.data.data),
};

/** The client's own audit trail. */
export const auditApi = {
  list: (params) => api.get('/audit', { params }).then((r) => r.data),
  actions: () => api.get('/audit/actions').then((r) => r.data.data),
};

/** MR Print World's platform-wide audit trail. */
export const platformAuditApi = {
  list: (params) => api.get('/super-admin/audit', { params }).then((r) => r.data),
  actions: () => api.get('/super-admin/audit/actions').then((r) => r.data.data),
};

export default notificationsApi;
