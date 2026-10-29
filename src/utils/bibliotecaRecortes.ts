import { arquivoCartazService } from '../services/arquivoCartazService';
import { carregarImagemDeDataUrl, salvarRecorteProduto } from './cartazPersistencia';

/**
 * Guarda o recorte na biblioteca da organização: o PNG sobe pro R2 sem projeto
 * (sobrevive ao projeto ser apagado) e, com `chave`, fica ligado ao produto.
 */
export async function guardarRecorteNaBiblioteca(blob: Blob, chave: string | null): Promise<string> {
  const arquivoId = await arquivoCartazService.enviarImagem(blob, 'image/png');
  if (chave) salvarRecorteProduto(chave, arquivoId);
  return arquivoId;
}

/** Copia (no servidor) um recorte da biblioteca pra dentro do projeto — cada arquivo pertence a um projeto só. */
export async function copiarRecorteParaProjeto(bibliotecaId: string, projetoId: string): Promise<{ arquivoId: string; imagem: HTMLImageElement }> {
  const copia = await arquivoCartazService.duplicar(bibliotecaId, projetoId);
  return { arquivoId: copia.id, imagem: await carregarImagemDeDataUrl(copia.url) };
}
