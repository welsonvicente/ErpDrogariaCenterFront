import { ManagerLayout } from '../components/ManagerLayout';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/**
 * Gestão → Preço de venda: o aplicativo de avaliação de preço de venda
 * (public/gestao/preco-de-venda.html), copiado sem alteração e embutido na
 * moldura do painel. A rota é protegida (só ADMIN/GERENTE); a ferramenta roda
 * inteira no navegador — planilhas do Trier, CMED, DSG, preços de mercado e a
 * tabela de markup ficam no localStorage/IndexedDB de quem usa.
 */
export function ManagerPrecoVendaPage() {
  useDocumentTitle('Preço de venda');
  return (
    <ManagerLayout>
      <div className="card ferramenta-embutida ferramenta-embutida--gestao">
        <iframe src="/gestao/preco-de-venda.html" title="Preço de Venda" />
      </div>
    </ManagerLayout>
  );
}
