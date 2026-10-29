/** Contas sobre as máscaras do recorte (puras, sem DOM) — rodam dentro do worker da IA. */

export interface PontoRecorte {
  x: number;
  y: number;
  manter: boolean;
}

/**
 * Tira os "farelos" soltos (pedaços de dedo/fundo que o modelo marcou longe do produto):
 * fica só a parte ligada a algum ponto "manter" — ou a maior, se nenhum ponto cair dentro.
 */
export function manterPartesDosPontos(mascara: Uint8Array, w: number, h: number, pontos: PontoRecorte[]): Uint8Array {
  const rotulo = new Int32Array(w * h);
  const tamanhos = [0];
  const pilha: number[] = [];
  for (let inicio = 0; inicio < w * h; inicio++) {
    if (!mascara[inicio] || rotulo[inicio]) continue;
    const r = tamanhos.length;
    let tamanho = 0;
    rotulo[inicio] = r;
    pilha.push(inicio);
    while (pilha.length) {
      const i = pilha.pop()!;
      tamanho++;
      const x = i % w;
      const vizinhos = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (const v of vizinhos) {
        if (v < 0 || v >= w * h || !mascara[v] || rotulo[v]) continue;
        rotulo[v] = r;
        pilha.push(v);
      }
    }
    tamanhos.push(tamanho);
  }
  if (tamanhos.length <= 2) return mascara; // 0 ou 1 parte: nada a limpar
  const manter = new Set<number>();
  for (const p of pontos) {
    if (!p.manter) continue;
    const r = rotulo[Math.round(p.y) * w + Math.round(p.x)];
    if (r) manter.add(r);
  }
  if (manter.size === 0) manter.add(tamanhos.indexOf(Math.max(...tamanhos.slice(1))));
  const saida = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (manter.has(rotulo[i])) saida[i] = 1;
  return saida;
}

/**
 * Limpa e ordena as 3 máscaras que o SAM devolve. Com um clique só, ele costuma dar nota alta a um
 * pedaço (um rótulo, uma letra): aí vale a maior — o produto inteiro. Máscara que pega quase a foto
 * toda é o fundo: vai pro fim da fila (ainda dá pra chegar nela em "Outra opção").
 */
export function ordenarCandidatas(brutas: Uint8Array[], notas: number[], w: number, h: number, pontos: PontoRecorte[]): Uint8Array[] {
  const n = w * h;
  const candidatas = brutas.map((bruta, k) => {
    const mascara = manterPartesDosPontos(bruta, w, h, pontos);
    let area = 0;
    for (let i = 0; i < n; i++) area += mascara[i];
    return { mascara, nota: notas[k] ?? 0, area };
  });
  type C = (typeof candidatas)[number];
  const ehFundo = (c: C) => c.area > n * 0.85;
  const ordem = pontos.length === 1 ? (a: C, b: C) => b.area - a.area : (a: C, b: C) => b.nota - a.nota;
  return [...candidatas.filter((c) => !ehFundo(c)).sort(ordem), ...candidatas.filter(ehFundo)].map((c) => c.mascara);
}
