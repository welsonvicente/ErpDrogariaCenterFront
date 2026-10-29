/// <reference lib="webworker" />
/**
 * Worker da IA de recorte (SlimSAM via transformers.js): o modelo e as contas
 * pesadas rodam fora da tela, então a página não trava enquanto recorta.
 * Uma foto por vez — "preparar" troca a foto atual.
 */
import { ordenarCandidatas, type PontoRecorte } from './recorteMascara';

const ID_MODELO = 'Xenova/slimsam-77-uniform';

export type PedidoRecorte =
  | { tipo: 'preparar'; id: number; largura: number; altura: number; pixels: Uint8ClampedArray }
  | { tipo: 'segmentar'; id: number; pontos: PontoRecorte[] };

export type RespostaRecorte =
  | { tipo: 'progresso'; id: number; percentual: number }
  | { tipo: 'pronto'; id: number }
  | { tipo: 'mascaras'; id: number; mascaras: Uint8Array[] }
  | { tipo: 'erro'; id: number; mensagem: string };

/* eslint-disable @typescript-eslint/no-explicit-any -- tipos da biblioteca são genéricos demais pro SAM */
let modelo: Promise<{ t: typeof import('@huggingface/transformers'); model: any; processor: any }> | null = null;
let atual: { entradas: any; embeddings: any; imagem: any; largura: number; altura: number } | null = null;
/* eslint-enable @typescript-eslint/no-explicit-any */

const enviar = (resposta: RespostaRecorte, transferir: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(resposta, transferir);

function carregarModelo(id: number) {
  if (!modelo) {
    modelo = (async () => {
      const t = await import('@huggingface/transformers');
      const baixado: Record<string, { carregado: number; total: number }> = {};
      const progresso = (info: { status?: string; file?: string; loaded?: number; total?: number }) => {
        if (info.status !== 'progress' || !info.file || !info.total) return;
        baixado[info.file] = { carregado: info.loaded ?? 0, total: info.total };
        const soma = Object.values(baixado).reduce((acc, a) => ({ c: acc.c + a.carregado, t: acc.t + a.total }), { c: 0, t: 0 });
        enviar({ tipo: 'progresso', id, percentual: Math.min(99, Math.round((soma.c / soma.t) * 100)) });
      };
      const [model, processor] = await Promise.all([
        t.SamModel.from_pretrained(ID_MODELO, { dtype: 'q8', progress_callback: progresso }),
        t.AutoProcessor.from_pretrained(ID_MODELO, { progress_callback: progresso }),
      ]);
      return { t, model, processor };
    })().catch((erro) => {
      modelo = null; // deixa tentar de novo (ex.: internet caiu no meio do download)
      throw erro;
    });
  }
  return modelo;
}

self.onmessage = async (e: MessageEvent<PedidoRecorte>) => {
  const pedido = e.data;
  try {
    if (pedido.tipo === 'preparar') {
      const { t, model, processor } = await carregarModelo(pedido.id);
      // A parte cara (embedding da foto, ~1–3s) roda uma vez; cada clique depois só refaz a máscara.
      const imagem = new t.RawImage(pedido.pixels, pedido.largura, pedido.altura, 4).rgb();
      const entradas = await processor(imagem);
      const embeddings = await model.get_image_embeddings(entradas);
      atual = { entradas, embeddings, imagem, largura: pedido.largura, altura: pedido.altura };
      enviar({ tipo: 'pronto', id: pedido.id });
      return;
    }

    if (!atual) throw new Error('foto não preparada');
    const { model, processor } = await carregarModelo(pedido.id);
    const { pontos } = pedido;
    const p = await processor(atual.imagem, {
      input_points: [[pontos.map((pt) => [pt.x, pt.y])]],
      input_labels: [[pontos.map((pt) => (pt.manter ? 1 : 0))]],
    });
    const saida = await model({ ...atual.embeddings, input_points: p.input_points, input_labels: p.input_labels });
    const [mascaras] = await processor.post_process_masks(saida.pred_masks, atual.entradas.original_sizes, atual.entradas.reshaped_input_sizes);
    const n = atual.largura * atual.altura;
    const dados = mascaras.data as ArrayLike<number | boolean>;
    const brutas = [0, 1, 2].map((k) => {
      const m = new Uint8Array(n);
      for (let i = 0; i < n; i++) m[i] = dados[k * n + i] ? 1 : 0;
      return m;
    });
    const ordenadas = ordenarCandidatas(brutas, Array.from(saida.iou_scores.data as ArrayLike<number>), atual.largura, atual.altura, pontos);
    enviar({ tipo: 'mascaras', id: pedido.id, mascaras: ordenadas }, ordenadas.map((m) => m.buffer));
  } catch (erro) {
    enviar({ tipo: 'erro', id: pedido.id, mensagem: erro instanceof Error ? erro.message : String(erro) });
  }
};
