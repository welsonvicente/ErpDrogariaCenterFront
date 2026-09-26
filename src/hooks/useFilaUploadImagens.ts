import { useRef, useState } from 'react';
import { arquivoCartazService } from '../services/arquivoCartazService';

export type EstadoUpload = 'pendente' | 'enviando' | 'ok' | 'erro';

export interface ItemUpload {
  idLocal: string;
  mimeType: string;
  estado: EstadoUpload;
  progresso: number;
  arquivoId: string | null;
  erro: string | null;
}

interface ItemInterno extends ItemUpload {
  blob: Blob;
  onSucesso?: (arquivoId: string) => void;
}

const CONCORRENCIA_MAXIMA = 3;

/**
 * Fila de upload de imagens pro R2 com concorrência limitada, progresso e
 * retry individual — usada em Panfleto/Importar planilha (várias fotos de
 * uma vez). Se 2 de 20 falharem, as outras 18 continuam intactas: cada item
 * é presign→PUT→confirmar independente dos demais.
 *
 * Guarda os itens completos (com o `Blob`) numa ref (`todosRef`), separada do
 * estado público (`itens`, sem o `Blob`) — assim um retry sempre tem acesso
 * ao Blob original, mesmo depois do item já ter passado pela fila e falhado.
 */
export function useFilaUploadImagens(projetoId: string | null) {
  const [itens, setItens] = useState<ItemUpload[]>([]);
  const todosRef = useRef<Map<string, ItemInterno>>(new Map());
  const filaRef = useRef<string[]>([]);
  const ativosRef = useRef(0);
  const projetoIdRef = useRef(projetoId);
  projetoIdRef.current = projetoId;

  function paraPublico(item: ItemInterno): ItemUpload {
    return { idLocal: item.idLocal, mimeType: item.mimeType, estado: item.estado, progresso: item.progresso, arquivoId: item.arquivoId, erro: item.erro };
  }

  function publicarTodos() {
    setItens(Array.from(todosRef.current.values()).map(paraPublico));
  }

  function publicar(idLocal: string, patch: Partial<ItemUpload>) {
    const item = todosRef.current.get(idLocal);
    if (!item) return;
    Object.assign(item, patch);
    publicarTodos();
  }

  function processarFila() {
    while (ativosRef.current < CONCORRENCIA_MAXIMA && filaRef.current.length > 0) {
      const idLocal = filaRef.current.shift() as string;
      const item = todosRef.current.get(idLocal);
      if (!item) continue;
      ativosRef.current++;
      enviarItem(item).finally(() => {
        ativosRef.current--;
        processarFila();
      });
    }
  }

  async function enviarItem(item: ItemInterno) {
    const projetoIdAtual = projetoIdRef.current;
    if (!projetoIdAtual) {
      publicar(item.idLocal, { estado: 'erro', erro: 'Nenhum projeto selecionado.' });
      return;
    }
    publicar(item.idLocal, { estado: 'enviando', progresso: 0, erro: null });
    try {
      const presign = await arquivoCartazService.presign({ projetoId: projetoIdAtual, mimeType: item.mimeType, tamanhoBytes: item.blob.size });
      await arquivoCartazService.uploadParaR2(presign.uploadUrl, presign.headers, item.blob, (percentual) => publicar(item.idLocal, { progresso: percentual }));
      await arquivoCartazService.confirmar(presign.arquivoId, projetoIdAtual);
      publicar(item.idLocal, { estado: 'ok', progresso: 100, arquivoId: presign.arquivoId });
      item.onSucesso?.(presign.arquivoId);
    } catch (erro) {
      publicar(item.idLocal, { estado: 'erro', erro: erro instanceof Error ? erro.message : 'Falha no upload.' });
    }
  }

  /** Enfileira uma ou mais imagens; `onSucesso` (por item) recebe o `arquivoId` já confirmado. */
  function adicionar(entradas: { blob: Blob; mimeType: string; onSucesso?: (arquivoId: string) => void }[]) {
    const idsNovos: string[] = [];
    entradas.forEach(({ blob, mimeType, onSucesso }) => {
      const idLocal = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      todosRef.current.set(idLocal, { idLocal, blob, mimeType, estado: 'pendente', progresso: 0, arquivoId: null, erro: null, onSucesso });
      filaRef.current.push(idLocal);
      idsNovos.push(idLocal);
    });
    publicarTodos();
    processarFila();
    return idsNovos;
  }

  function tentarNovamente(idLocal: string) {
    const item = todosRef.current.get(idLocal);
    if (!item || item.estado === 'ok' || item.estado === 'enviando') return;
    filaRef.current.push(idLocal);
    processarFila();
  }

  function remover(idLocal: string) {
    todosRef.current.delete(idLocal);
    filaRef.current = filaRef.current.filter((id) => id !== idLocal);
    publicarTodos();
  }

  function limpar() {
    todosRef.current.clear();
    filaRef.current = [];
    setItens([]);
  }

  return { itens, adicionar, tentarNovamente, remover, limpar };
}
