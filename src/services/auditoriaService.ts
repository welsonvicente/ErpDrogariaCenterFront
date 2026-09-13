import { api } from './api';
import type { RegistroAuditoria } from '../types';

export const auditoriaService = {
  async list() {
    const { data } = await api.get<RegistroAuditoria[]>('/auditoria');
    return data;
  },
};
