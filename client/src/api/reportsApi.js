import api from './client';
import { saveBlob } from './clientApi';

export const reportsApi = {
  client: () => api.get('/reports').then((r) => r.data.data),
  platform: () => api.get('/super-admin/reports').then((r) => r.data.data),

  /**
   * The print package is a stream, so it is fetched as a blob through axios
   * rather than a plain link - these routes require the Authorization header.
   */
  exportLot: (lotId, lotNumber) =>
    api
      .get(`/lots/${lotId}/export`, { responseType: 'blob' })
      .then((r) => saveBlob(r.data, `${lotNumber || 'print-package'}.zip`)),

  exportJob: (jobId, jobNumber) =>
    api
      .get(`/super-admin/jobs/${jobId}/export`, { responseType: 'blob' })
      .then((r) => saveBlob(r.data, `${jobNumber || 'print-package'}.zip`)),

  exportSubmissions: (params) =>
    api
      .get('/submissions/export', { params, responseType: 'blob' })
      .then((r) =>
        saveBlob(r.data, params?.format === 'csv' ? 'submissions.csv' : 'submissions.xlsx')
      ),
};

export default reportsApi;
