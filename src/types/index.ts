export type PerfilUsuario = 'ADMIN' | 'GESTOR' | 'FUNCIONARIO';

/** Sessão do usuário autenticado (o que a API devolve no login), independente do perfil. */
export interface UsuarioSessao {
  id: string;
  nome: string;
  email: string | null;
  perfil: PerfilUsuario;
  icone?: string;
}

export interface Organizacao {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
}

/** Funcionário gerenciado pelo gestor (Usuario com perfil FUNCIONARIO). */
export interface Funcionario {
  id: string;
  nome: string;
  codigo: string;
  icone: string;
  perfil: PerfilUsuario;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Categoria {
  id: string;
  nome: string;
  icone: string;
  ordem: number;
  ativo: boolean;
}

export type FormaPagamento = 'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'PIX' | 'BOLETO' | 'OUTRO';

export const FORMA_PAGAMENTO_LABEL: Record<FormaPagamento, string> = {
  DINHEIRO: 'Dinheiro',
  CARTAO_DEBITO: 'Cartão de Débito',
  CARTAO_CREDITO: 'Cartão de Crédito',
  PIX: 'PIX',
  BOLETO: 'Boleto',
  OUTRO: 'Outro',
};

export interface Despesa {
  id: string;
  data: string;
  valor: string;
  formaPagamento: FormaPagamento;
  descricao: string | null;
  usuarioId: string;
  categoriaId: string;
  usuario: Funcionario;
  categoria: Categoria;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ListaDespesasResultado {
  items: Despesa[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  valorTotal: number;
}

export interface ResumoDespesas {
  valorTotal: number;
  porCategoria: Array<{
    categoriaId: string;
    categoriaNome: string;
    categoriaIcone: string;
    total: string;
  }>;
}
