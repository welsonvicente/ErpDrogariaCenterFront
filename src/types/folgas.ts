export interface FolgasColaborador {
  id: string;
  usuarioId: string | null;
  name: string;
}

export interface FolgasCredito {
  id: string;
  employeeId: string;
  workedDate: string;
  note?: string;
  createdAt: string;
}

export interface FolgaAgendada {
  id: string;
  employeeId: string;
  date: string;
  createdAt: string;
}

export interface FolgasAfastamento {
  id: string;
  employeeId: string;
  type: 'ferias' | 'atestado';
  startDate: string;
  endDate: string;
  note?: string | null;
  submittedBy?: 'colaborador';
  createdAt: string;
}

export type FormaPagamentoFolga = 'dinheiro' | 'pix' | 'outro';

export interface TrocaFolga {
  id: string;
  employeeId: string;
  workedDate: string;
  valor: number;
  forma: FormaPagamentoFolga;
  nota?: string;
  createdAt: string;
  createdBy?: string;
  originalCredit?: FolgasCredito;
}

export interface DataBloqueada {
  id: string;
  date: string;
  reason?: string;
  by?: string | null;
  createdAt: string;
}

export interface DiaSemanaBloqueado {
  weekday: number;
  by?: string | null;
  at?: string | null;
}

export interface AuditoriaFolgas {
  id: string;
  role: string;
  action: string;
  details?: string;
  timestamp: string;
}

export interface EstadoFolgas {
  employees: FolgasColaborador[];
  credits: FolgasCredito[];
  daysOff: FolgaAgendada[];
  leaves: FolgasAfastamento[];
  creditSwaps: TrocaFolga[];
  blockedDates: DataBloqueada[];
  blockedWeekdays: DiaSemanaBloqueado[];
  auditLog: AuditoriaFolgas[];
}

export function estadoFolgasVazio(): EstadoFolgas {
  return {
    employees: [],
    credits: [],
    daysOff: [],
    leaves: [],
    creditSwaps: [],
    blockedDates: [],
    blockedWeekdays: [],
    auditLog: [],
  };
}

