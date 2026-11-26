import type { ProjetoCartazCompleto, TipoProjetoCartaz } from '../services/projetoCartazService';
import { projetoCartazService } from '../services/projetoCartazService';

/**
 * Campanha aberta na tela de Cartazes. Fica num módulo (não num estado React)
 * porque os 3 modos e o serviço de projetos leem dela ao criar/listar/retomar
 * projetos — a casca (CartazesPage) define antes de montar os modos e remonta
 * os modos quando troca de campanha.
 *
 * Neste aparelho, guarda só qual campanha estava aberta (o resto está no servidor).
 */

const CHAVE_CAMPANHA_ATIVA = 'cartazes_campanha_ativa_v1';

let atual: { id: string; nome: string } | null = null;

export function definirCampanhaAtiva(campanha: { id: string; nome: string } | null) {
  atual = campanha ? { id: campanha.id, nome: campanha.nome } : null;
  try {
    if (campanha) localStorage.setItem(CHAVE_CAMPANHA_ATIVA, campanha.id);
    else localStorage.removeItem(CHAVE_CAMPANHA_ATIVA);
  } catch {
    /* sem localStorage: só não reabre sozinha na próxima vez */
  }
}

export function campanhaAtiva() {
  return atual;
}

/** Id da campanha que estava aberta neste aparelho (pra reabrir direto). */
export function campanhaSalvaNoAparelho(): string | null {
  try {
    return localStorage.getItem(CHAVE_CAMPANHA_ATIVA);
  } catch {
    return null;
  }
}

/**
 * Projeto do modo dentro da campanha aberta, quando não há um "ativo" lembrado:
 * o mais recente da campanha ou, se ela ainda não tem desse tipo, um novo com o
 * nome da campanha — a pessoa já cai trabalhando, sem escolher projeto.
 */
export async function projetoInicialDaCampanha(tipo: TipoProjetoCartaz): Promise<ProjetoCartazCompleto | null> {
  if (!atual) return null;
  const projetos = await projetoCartazService.listar(tipo);
  const id = projetos[0]?.id ?? (await projetoCartazService.criar(tipo, atual.nome)).id;
  return projetoCartazService.obter(id);
}
