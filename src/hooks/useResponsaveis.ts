import { useEffect, useMemo, useState } from 'react';
import { useEstoque } from '../context/EstoqueContext';
import { funcionarioService } from '../services/funcionarioService';

/**
 * Nomes sugeridos pro campo "Responsável pela ação": os colegas cadastrados e
 * quem já foi escolhido em algum produto. É só sugestão (datalist) — o campo
 * continua aceitando qualquer nome, porque o responsável pode ser alguém que
 * não tem acesso ao sistema.
 */
export function useResponsaveis(): string[] {
  const { produtos } = useEstoque();
  const [colegas, setColegas] = useState<string[]>([]);

  useEffect(() => {
    let ativo = true;
    funcionarioService
      .listColegas()
      .then((lista) => ativo && setColegas(lista.map((c) => c.nome)))
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);

  return useMemo(() => {
    const nomes = new Set(colegas);
    for (const p of produtos) if (p.responsavel) nomes.add(p.responsavel);
    return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [colegas, produtos]);
}
