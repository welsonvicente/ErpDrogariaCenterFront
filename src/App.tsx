import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import './App.css';
import { OrgLayout } from './components/OrgLayout';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import { ProtectedRoute } from './components/ProtectedRoute';
import { UpdateBanner } from './components/UpdateBanner';
import { EmployeeCodePage } from './pages/EmployeeCodePage';
import { EmployeeExpensePage } from './pages/EmployeeExpensePage';
import { ManagerAuditoriaPage } from './pages/ManagerAuditoriaPage';
import { ManagerCategoriesPage } from './pages/ManagerCategoriesPage';
import { ManagerDashboardPage } from './pages/ManagerDashboardPage';
import { ManagerFuncionariosPage } from './pages/ManagerFuncionariosPage';
import { ManagerLoginPage } from './pages/ManagerLoginPage';
import { OrganizationLoginPage } from './pages/OrganizationLoginPage';
import { RegisterOrganizationPage } from './pages/RegisterOrganizationPage';
import { SettingsPage } from './pages/SettingsPage';

/**
 * Manda "/:orgSlug/gestor/<resto>" para "/:orgSlug/gerente/<resto>", preservando
 * o caminho e a query — assim um favorito antigo do dashboard cai no dashboard,
 * e não na porta da organização.
 */
function RedirecionaGestorParaGerente() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { pathname, search } = useLocation();
  const destino = pathname.replace(`/${orgSlug}/gestor`, `/${orgSlug}/gerente`);
  return <Navigate to={`${destino}${search}`} replace />;
}

/**
 * Ferramentas que são páginas estáticas (public/tools/*), fora do bundle do
 * React — ver EmployeeExpensePage.
 *
 * Ficam sob a rota da organização como todo o resto ("/:orgSlug/cartazes"), e
 * não soltas em "/tools/arquivo.html": o slug na URL é o que identifica o
 * inquilino em todo o sistema, e uma ferramenta que guarda dado por organização
 * não podia ser a exceção. Como um arquivo estático não vira rota do React, a
 * página é embutida aqui — mesma origem, então ela continua lendo a sessão do
 * localStorage exatamente como antes.
 */
function FerramentaEstatica({ arquivo, titulo }: { arquivo: string; titulo: string }) {
  useDocumentTitle(titulo);
  return (
    <iframe
      src={`/tools/${arquivo}`}
      title={titulo}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none' }}
    />
  );
}

function App() {
  return (
    <>
      <UpdateBanner />
      <Routes>
        {/* Login geral: o gerente entra com e-mail+senha sem saber o slug da organização de antemão. */}
        <Route path="/" element={<OrganizationLoginPage />} />
        <Route path="/cadastro" element={<RegisterOrganizationPage />} />

        <Route path=":orgSlug" element={<OrgLayout />}>
          {/* Entrada pública do funcionário (terminal do balcão): pede código+PIN direto, sem tela intermediária. */}
          <Route index element={<EmployeeCodePage />} />
          <Route path="funcionario" element={<EmployeeCodePage />} />
          <Route path="funcionario/lancar" element={<EmployeeExpensePage />} />

          {/* Ferramentas do balcão — usáveis por funcionário e por gerente. */}
          <Route path="cartazes" element={<FerramentaEstatica arquivo="cartazes.html" titulo="Cartazes e panfletos" />} />
          <Route
            path="folgas"
            element={<FerramentaEstatica arquivo="folgas-drogaria-center.html" titulo="Folgas" />}
          />

          {/* Login direto de gerente já sabendo o slug (atalho opcional) e o hub pós-login. */}
          <Route path="gerente/login" element={<ManagerLoginPage />} />
          {/* O hub de módulos sumiu: com o menu lateral, uma tela só pra listar
              "Gastos" era um clique a mais em toda entrada. Links antigos e o
              atalho "← Ferramentas" caem no painel. */}
          <Route path="ferramentas" element={<Navigate to="../gerente" replace />} />
          <Route
            path="configuracoes"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />

          {/* Módulo Gastos */}
          <Route
            path="gerente"
            element={
              <ProtectedRoute>
                <ManagerDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="gerente/funcionarios"
            element={
              <ProtectedRoute>
                <ManagerFuncionariosPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="gerente/categorias"
            element={
              <ProtectedRoute>
                <ManagerCategoriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="gerente/auditoria"
            element={
              <ProtectedRoute>
                <ManagerAuditoriaPage />
              </ProtectedRoute>
            }
          />
          {/*
            As telas de gerente moravam em "/gestor/..." antes do papel ser
            renomeado. Quem tem link salvo (ou o navegador autocompletando)
            continua caindo lá — sem isto, a rota não casa com nada e a pessoa vê
            uma página em branco, sem pista do que houve.
          */}
          <Route path="gestor/*" element={<RedirecionaGestorParaGerente />} />

          {/* Qualquer outro caminho dentro da organização volta pra entrada dela. */}
          <Route path="*" element={<Navigate to="." replace />} />
        </Route>

        {/* Fora de uma organização, qualquer caminho desconhecido volta pro login geral. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
