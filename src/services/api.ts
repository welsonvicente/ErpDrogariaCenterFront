import axios from 'axios';

export type AreaSessao = 'gestor' | 'funcionario';

const SESSION_KEY_GESTOR = 'drogaria:session:gestor';
const SESSION_KEY_FUNCIONARIO = 'drogaria:session:funcionario';

/**
 * Caminhos (já sem o slug da organização) que pertencem à área do gestor.
 * "ferramentas" e "configuracoes" não têm "/gestor" no path mas são a mesma
 * área — por isso não dá pra checar só `startsWith('/gestor')`.
 */
const PREFIXOS_GESTOR = ['/gestor', '/ferramentas', '/configuracoes'];

/**
 * Deriva se a rota atual é do gestor ou do funcionário a partir do pathname
 * (ex.: "/drogariacenter/gestor/categorias" -> "gestor",
 * "/drogariacenter/funcionario/lancar" -> "funcionario"). Usado tanto pelo
 * AuthContext (pra saber qual sessão exibir) quanto pelo interceptor do
 * axios (pra saber qual token anexar) — assim as duas pontas nunca divergem.
 */
export function areaDaRota(pathname: string): AreaSessao {
  const semOrgSlug = pathname.replace(/^\/[^/]+/, '') || '/';
  const ehGestor = PREFIXOS_GESTOR.some((prefixo) => semOrgSlug === prefixo || semOrgSlug.startsWith(`${prefixo}/`));
  return ehGestor ? 'gestor' : 'funcionario';
}

function chaveSessao(area: AreaSessao) {
  return area === 'gestor' ? SESSION_KEY_GESTOR : SESSION_KEY_FUNCIONARIO;
}

export interface SessaoArmazenada {
  orgSlug: string;
  token: string;
  usuario: { id: string; nome: string; email: string | null; perfil: string; icone?: string };
}

/**
 * Gestor e funcionário usam chaves de sessão separadas no localStorage.
 * Antes havia uma única chave compartilhada: logar como funcionário numa
 * aba sobrescrevia a sessão e "sequestrava" quem estava logado como gestor
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

export function salvarSessao(area: AreaSessao, sessao: SessaoArmazenada) {
  localStorage.setItem(chaveSessao(area), JSON.stringify(sessao));
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
 * Instância única do axios usada por todos os services.
 * - o token da sessão da área atual (gestor ou funcionário, pela URL) é anexado automaticamente em toda requisição.
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
