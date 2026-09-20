import axios from 'axios';

export type AreaSessao = 'gerente' | 'funcionario';

// O papel passou a se chamar GERENTE, mas a CHAVE continua 'gestor' de
// propósito: é um identificador opaco de armazenamento, lido também pelas
// ferramentas estáticas em public/tools/ (que não passam pelo build). Trocá-la
// deslogaria todo mundo e quebraria as ferramentas até elas serem atualizadas,
// sem ganho nenhum — ninguém vê essa string.
const SESSION_KEY_GERENTE = 'drogaria:session:gestor';
const SESSION_KEY_FUNCIONARIO = 'drogaria:session:funcionario';

/**
 * Caminhos (já sem o slug da organização) que pertencem à área do gerente.
 * "ferramentas" e "configuracoes" não têm "/gerente" no path mas são a mesma
 * área — por isso não dá pra checar só `startsWith('/gerente')`.
 */
const PREFIXOS_GERENTE = ['/gerente', '/ferramentas', '/configuracoes'];

/**
 * Cartazes e Folgas são usadas pelo MESMO link tanto por quem entrou pela área
 * do gerente quanto pela do funcionário — path sozinho não diz qual sessão usar
 * aqui, diferente do resto do sistema.
 */
const PREFIXOS_COMPARTILHADOS = ['/cartazes', '/folgas'];

/**
 * Deriva se a rota atual é do gerente ou do funcionário a partir do pathname
 * (ex.: "/drogariacenter/gerente/categorias" -> "gerente",
 * "/drogariacenter/funcionario/lancar" -> "funcionario"). Usado tanto pelo
 * AuthContext (pra saber qual sessão exibir) quanto pelo interceptor do
 * axios (pra saber qual token anexar) — assim as duas pontas nunca divergem.
 */
export function areaDaRota(pathname: string): AreaSessao {
  const semOrgSlug = pathname.replace(/^\/[^/]+/, '') || '/';

  const ehGerente = PREFIXOS_GERENTE.some((prefixo) => semOrgSlug === prefixo || semOrgSlug.startsWith(`${prefixo}/`));
  if (ehGerente) return 'gerente';

  // Numa rota compartilhada, se existir sessão de gerente salva é dela que
  // veio o clique — funcionário não tem outra área de onde chegar aqui. Sem
  // isso, um gerente abrindo Cartazes/Folgas caía sempre na área errada
  // (tentando ler a sessão de funcionário, que ele pode nem ter).
  const ehCompartilhada = PREFIXOS_COMPARTILHADOS.some((prefixo) => semOrgSlug === prefixo || semOrgSlug.startsWith(`${prefixo}/`));
  if (ehCompartilhada) {
    try {
      if (localStorage.getItem(SESSION_KEY_GERENTE)) return 'gerente';
    } catch {
      /* sem storage — cai no padrão abaixo */
    }
  }

  return 'funcionario';
}

function chaveSessao(area: AreaSessao) {
  return area === 'gerente' ? SESSION_KEY_GERENTE : SESSION_KEY_FUNCIONARIO;
}

export interface SessaoArmazenada {
  orgSlug: string;
  token: string;
  usuario: {
    id: string;
    nome: string;
    email: string | null;
    perfil: string;
    icone?: string;
    pinForte?: boolean;
  };
  /** Preenchido por `salvarSessao` — lido pelas ferramentas estáticas. */
  apiBaseUrl?: string;
  /**
   * Marca uma sessão de gerente que nasceu do login de funcionário (funcionário
   * que entra por código+PIN, ver ProtectedRoute). Existe pra que sair do
   * funcionário derrube junto o acesso ao painel — sem isso, a próxima pessoa no
   * terminal do balcão herdaria o painel do gerente de quem usou antes.
   */
  origemFuncionario?: boolean;
}

/**
 * Espelha a sessão do funcionário na área de gerente, pra quem tem
 * que entra pelo balcão. As duas áreas usam chaves separadas de propósito (ver
 * acima), e o interceptor escolhe o token pela rota — então entrar no painel sem
 * isso mandaria requisição sem token nenhum. O token é o MESMO: quem autoriza é
 * o backend, que confere a permissão no banco a cada chamada (requireGerente).
 */
export function espelharSessaoParaGestor(sessaoFuncionario: SessaoArmazenada) {
  salvarSessao('gerente', { ...sessaoFuncionario, origemFuncionario: true });
}

/**
 * Encerra a sessão de funcionário e, junto, a de gerente que tenha vindo dela.
 * Usado no "Trocar funcionário" — terminal compartilhado não pode deixar um
 * acesso elevado pendurado pro próximo da fila.
 */
export function removerSessaoFuncionarioEDerivadas() {
  const gerente = lerSessao('gerente');
  if (gerente?.origemFuncionario) removerSessao('gerente');
  removerSessao('funcionario');
}

/**
 * Gerente e funcionário usam chaves de sessão separadas no localStorage.
 * Antes havia uma única chave compartilhada: logar como funcionário numa
 * aba sobrescrevia a sessão e "sequestrava" quem estava logado como gerente
 * (e vice-versa), inclusive entre abas diferentes do mesmo navegador — isso
 * causava tanto erros de permissão quanto despesas lançadas em nome da
 * conta errada. Cada área agora só enxerga a própria sessão.
 */
export function lerSessao(area: AreaSessao): SessaoArmazenada | null {
  const raw = localStorage.getItem(chaveSessao(area));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessaoArmazenada;
  } catch {
    return null;
  }
}

/**
 * Decodifica só o `exp` do payload de um JWT, sem checar assinatura — é uso
 * puramente de UI (decidir se vale a pena redirecionar direto com esse token
 * ou mostrar a tela de login), nunca uma validação de segurança: quem garante
 * que o token é válido de verdade é sempre o backend, a cada requisição.
 */
export function tokenExpirado(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export function salvarSessao(area: AreaSessao, sessao: SessaoArmazenada) {
  // `apiBaseUrl` vai junto pra que as ferramentas estáticas (public/tools/*)
  // saibam pra onde falar. Elas não passam pelo build do Vite, então não
  // enxergam VITE_API_URL — antes isso era resolvido mandando a URL na query
  // string do link (`?api=...`), o que virava um jeito de qualquer link
  // redirecionar as chamadas (com o token junto) pra um servidor de fora.
  // O localStorage é do mesmo origin e só o app escreve nele: o valor chega às
  // ferramentas sem passar por nada que o usuário (ou um link) consiga forjar.
  localStorage.setItem(chaveSessao(area), JSON.stringify({ ...sessao, apiBaseUrl: resolverBaseUrl() }));
}

export function removerSessao(area: AreaSessao) {
  localStorage.removeItem(chaveSessao(area));
}

/**
 * Se VITE_API_URL não for definida, o backend é assumido no mesmo host que
 * serviu o front, na porta 3333. Isso é o que permite abrir o app pelo IP da
 * máquina (ex.: http://192.168.0.57:5173) de outro dispositivo na mesma rede
 * e ele já falar com o backend certo — sem isso, ficaria preso em
 * "localhost", que de outro aparelho aponta pra ele mesmo, não pro servidor.
 */
function resolverBaseUrl(): string {
  const configurado = import.meta.env.VITE_API_URL;
  if (configurado) return configurado;
  return `${window.location.protocol}//${window.location.hostname}:3333/api`;
}

/**
 * Preenche `apiBaseUrl` em sessões salvas antes desse campo existir.
 *
 * As ferramentas estáticas descobrem a URL da API por ele (ver `salvarSessao`).
 * Quem já estava logado no deploy que introduziu o campo tinha uma sessão sem
 * ele — e o fallback das ferramentas só acerta em desenvolvimento, então em
 * produção elas falhavam com erro de conexão até a pessoa deslogar e logar de
 * novo. Isto conserta na primeira vez que o app carrega, sem ninguém perceber.
 */
function preencherApiBaseUrlEmSessoesAntigas() {
  for (const area of ['gerente', 'funcionario'] as AreaSessao[]) {
    try {
      const sessao = lerSessao(area);
      if (sessao && !sessao.apiBaseUrl) salvarSessao(area, sessao);
    } catch {
      /* localStorage indisponível — nada a migrar */
    }
  }
}

preencherApiBaseUrlEmSessoesAntigas();

/**
 * Instância única do axios usada por todos os services.
 * - o token da sessão da área atual (gerente ou funcionário, pela URL) é anexado automaticamente em toda requisição.
 * - respostas 401 limpam a sessão local da área atual (o AuthProvider detecta isso e desloga).
 */
export const api = axios.create({
  baseURL: resolverBaseUrl(),
});

api.interceptors.request.use((config) => {
  const sessao = lerSessao(areaDaRota(window.location.pathname));
  if (sessao?.token) {
    config.headers.Authorization = `Bearer ${sessao.token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      removerSessao(areaDaRota(window.location.pathname));
    }
    return Promise.reject(error);
  },
);
