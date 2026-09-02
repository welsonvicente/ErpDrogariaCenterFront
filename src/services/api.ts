import axios from 'axios';

export const SESSION_KEY = 'drogaria:session';

export interface SessaoArmazenada {
  orgSlug: string;
  token: string;
  usuario: { id: string; nome: string; email: string | null; perfil: string; icone?: string };
}

export function lerSessao(): SessaoArmazenada | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessaoArmazenada;
  } catch {
    return null;
  }
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
 * - o token da sessão atual (se existir) é anexado automaticamente em toda requisição.
 * - respostas 401 limpam a sessão local (o AuthProvider detecta isso e desloga).
 */
export const api = axios.create({
  baseURL: resolverBaseUrl(),
});

api.interceptors.request.use((config) => {
  const sessao = lerSessao();
  if (sessao?.token) {
    config.headers.Authorization = `Bearer ${sessao.token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(SESSION_KEY);
    }
    return Promise.reject(error);
  },
);
