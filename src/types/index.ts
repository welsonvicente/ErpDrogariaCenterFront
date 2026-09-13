export type PerfilUsuario = 'ADMIN' | 'GESTOR' | 'FUNCIONARIO';

/** Sessão do usuário autenticado (o que a API devolve no login), independente do perfil. */
export interface UsuarioSessao {
  id: string;
  nome: string;
  email: string | null;
  perfil: PerfilUsuario;
  icone?: string;
  /** Só relevante para FUNCIONARIO — mostra o atalho pro login do gestor no painel dele. */
  podeAcessarGestor?: boolean;
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
  podeAcessarGestor: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

/** Versão enxuta de Funcionario usada no seletor "quem recebeu a diária" (ver GET /usuarios/colegas). */
export interface Colega {
  id: string;
  nome: string;
  icone: string;
}

export interface Categoria {
  id: string;
  nome: string;
  icone: string;
  ordem: number;
  ativo: boolean;
}

/**
 * Nome exato da categoria que exige escolher quem recebe o valor (ver
 * DespesaService.assertBeneficiario no backend) — precisa bater com o seed
 * (categoriasPadrao.ts). Compartilhado entre a tela de lançamento e a de
 * edição pra não haver duas cópias que podem divergir.
 */
export const CATEGORIA_DIARIA_NOME = 'Diária de domingo ou feriado';

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
  beneficiarioId: string | null;
  beneficiario: Funcionario | null;
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
