export type PerfilUsuario = 'ADMIN' | 'GERENTE' | 'FUNCIONARIO';

/** Sessão do usuário autenticado (o que a API devolve no login), independente do perfil. */
export interface UsuarioSessao {
  id: string;
  nome: string;
  email: string | null;
  perfil: PerfilUsuario;
  icone?: string;
  /** Já definiu o PIN próprio que libera o painel (ver backend Usuario.pinForte). */
  pinForte?: boolean;
}

export interface Organizacao {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
}

/** Funcionário gerenciado pelo gerente (Usuario com perfil FUNCIONARIO). */
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
  /** Quando true, lançar um gasto nessa categoria exige escolher quem recebeu o valor (ver DespesaService.assertBeneficiario). */
  exigeBeneficiario: boolean;
  /** Lançar nessa categoria exige informar quantas unidades saíram. */
  exigeQuantidade: boolean;
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
  beneficiarioId: string | null;
  /** Unidades retiradas — só nas categorias com `exigeQuantidade`. */
  quantidade: number | null;
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

/** Trilha de ações sensíveis consultável pelo gerente (ver GET /auditoria). */
export interface RegistroAuditoria {
  id: string;
  usuarioNome: string;
  usuarioEmail: string | null;
  acao: string;
  detalhes: string | null;
  criadoEm: string;
}

export const ACAO_AUDITORIA_LABEL: Record<string, string> = {
  'despesa.editada': 'Editou um lançamento',
  'despesa.excluida': 'Excluiu um lançamento',
  'usuario.papel_promovido': 'Promoveu a um papel de gestão',
  'usuario.papel_rebaixado': 'Rebaixou para funcionário',
  // Ações antigas, de antes dos papéis substituírem a flag de acesso — mantidas
  // para que registros já gravados continuem legíveis na tela de auditoria.
  'funcionario.acesso_gestor_concedido': 'Concedeu acesso ao Painel do Gerente',
  'funcionario.acesso_gestor_revogado': 'Revogou acesso ao Painel do Gerente',
};

/** Nome de cada papel na interface — ver backend PerfilUsuario. */
export const PERFIL_LABEL: Record<PerfilUsuario, string> = {
  ADMIN: 'Administrador',
  GERENTE: 'Gerente',
  FUNCIONARIO: 'Funcionário',
};
