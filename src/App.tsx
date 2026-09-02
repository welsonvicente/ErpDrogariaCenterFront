import { Route, Routes } from 'react-router-dom';
import './App.css';
import { OrgLayout } from './components/OrgLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { EmployeeCodePage } from './pages/EmployeeCodePage';
import { EmployeeExpensePage } from './pages/EmployeeExpensePage';
import { ManagerCategoriesPage } from './pages/ManagerCategoriesPage';
import { ManagerDashboardPage } from './pages/ManagerDashboardPage';
import { ManagerFuncionariosPage } from './pages/ManagerFuncionariosPage';
import { ManagerLoginPage } from './pages/ManagerLoginPage';
import { OrganizationLoginPage } from './pages/OrganizationLoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { ToolsHubPage } from './pages/ToolsHubPage';

function App() {
  return (
    <Routes>
      {/* Login geral: o gestor entra com e-mail+senha sem saber o slug da organização de antemão. */}
      <Route path="/" element={<OrganizationLoginPage />} />

      <Route path=":orgSlug" element={<OrgLayout />}>
        {/* Entrada pública do funcionário (terminal do balcão): pede código+PIN direto, sem tela intermediária. */}
        <Route index element={<EmployeeCodePage />} />
        <Route path="funcionario" element={<EmployeeCodePage />} />
        <Route path="funcionario/lancar" element={<EmployeeExpensePage />} />

        {/* Login direto de gestor já sabendo o slug (atalho opcional) e o hub pós-login. */}
        <Route path="gestor/login" element={<ManagerLoginPage />} />
        <Route
          path="ferramentas"
          element={
            <ProtectedRoute>
              <ToolsHubPage />
            </ProtectedRoute>
          }
        />
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
          path="gestor"
          element={
            <ProtectedRoute>
              <ManagerDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="gestor/funcionarios"
          element={
            <ProtectedRoute>
              <ManagerFuncionariosPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="gestor/categorias"
          element={
            <ProtectedRoute>
              <ManagerCategoriesPage />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
