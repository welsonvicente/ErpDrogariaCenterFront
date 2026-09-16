import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { BrandLogo } from './BrandLogo';
import { useAuth } from '../context/AuthContext';
import { lerSessao } from '../services/api';
import { PERFIL_LABEL, type PerfilUsuario } from '../types';

const CHAVE_MENU_RECOLHIDO = 'drogaria:menu:recolhido';

interface ItemMenu {
  rotulo: string;
  icone: string;
  para: string;
  /** Casa só o caminho exato — pro Dashboard não ficar ativo nas telas filhas. */
  exato?: boolean;
  /** Ausente = qualquer pessoa que chega ao painel. */
  somentePara?: PerfilUsuario[];
  /** Abre fora do painel, em outra aba (ferramenta em tela cheia). */
  externo?: boolean;
}

interface GrupoMenu {
  rotulo: string;
  icone: string;
  itens: ItemMenu[];
}

/**
 * Os grupos separam assunto, não perfil: quem vê o quê é decidido item a item
 * (`somentePara`) e, de verdade, pelo backend. Um grupo que fica sem nenhum item
 * visível simplesmente não é renderizado.
 */
function montarMenu(orgSlug: string | undefined): GrupoMenu[] {
  const org = `/${orgSlug}`;
  return [
    {
      rotulo: 'Gastos',
      icone: '🧾',
      itens: [
        { rotulo: 'Dashboard', icone: '📊', para: `${org}/gerente`, exato: true },
        { rotulo: 'Categorias', icone: '🏷️', para: `${org}/gerente/categorias` },
      ],
    },
    {
      rotulo: 'Equipe',
      icone: '👥',
      itens: [{ rotulo: 'Funcionários', icone: '🧑‍💼', para: `${org}/gerente/funcionarios` }],
    },
    {
      rotulo: 'Ferramentas',
      icone: '🧰',
      itens: [
        { rotulo: 'Cartazes e panfletos', icone: '🖼️', para: `${org}/cartazes`, externo: true },
        { rotulo: 'Folgas', icone: '📅', para: `${org}/folgas`, externo: true },
      ],
    },
    {
      rotulo: 'Organização',
      icone: '🏢',
      itens: [
        { rotulo: 'Auditoria', icone: '🔎', para: `${org}/gerente/auditoria` },
        { rotulo: 'Configurações', icone: '⚙️', para: `${org}/configuracoes` },
      ],
    },
  ];
}

/**
 * Casca das telas de ADMIN/GERENTE: menu lateral à esquerda, conteúdo à direita.
 *
 * Substituiu uma fileira de abas que só cabia enquanto o painel tinha quatro
 * telas. Com os assuntos em grupos, cada módulo novo entra no lugar dele em vez
 * de alargar a fileira até ela quebrar a linha.
 *
 * O menu recolhe pra uma faixa de ícones (a preferência fica no navegador de
 * quem usa) e, em tela estreita, vira uma gaveta por cima do conteúdo — no
 * celular não há largura pra manter as duas coisas lado a lado.
 */
export function ManagerLayout({ children }: { children: ReactNode }) {
  const { usuario, logout } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [recolhido, setRecolhido] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_MENU_RECOLHIDO) === '1';
    } catch {
      return false;
    }
  });
  // Gaveta do celular: nasce fechada e fecha a cada navegação, senão cobriria a
  // tela que a pessoa acabou de abrir.
  const [gavetaAberta, setGavetaAberta] = useState(false);

  const grupos = montarMenu(orgSlug);
  const perfil = usuario?.perfil;

  const grupoTemAtivo = (g: GrupoMenu) =>
    g.itens.some((i) => !i.externo && (pathname === i.para || pathname.startsWith(`${i.para}/`)));

  const [abertos, setAbertos] = useState<string[]>(() => grupos.filter(grupoTemAtivo).map((g) => g.rotulo));

  // Item da tela atual — casa o caminho mais longo, pra "/gerente/categorias"
  // não ser atendido pelo "/gerente" do Dashboard.
  const ativo = grupos
    .flatMap((g) => g.itens.filter((i) => !i.externo).map((item) => ({ grupo: g.rotulo, item })))
    .filter(({ item }) => pathname === item.para || (!item.exato && pathname.startsWith(`${item.para}/`)))
    .sort((a, b) => b.item.para.length - a.item.para.length)[0];

  // Ir pra uma tela de outro grupo abre esse grupo — senão o item ativo ficaria
  // escondido dentro de um grupo fechado.
  useEffect(() => {
    const comAtivo = montarMenu(orgSlug)
      .filter((g) => g.itens.some((i) => !i.externo && (pathname === i.para || pathname.startsWith(`${i.para}/`))))
      .map((g) => g.rotulo);
    if (comAtivo.length) setAbertos((atuais) => [...new Set([...atuais, ...comAtivo])]);
    setGavetaAberta(false);
  }, [pathname, orgSlug]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_MENU_RECOLHIDO, recolhido ? '1' : '0');
    } catch {
      /* sem storage — a preferência só não persiste */
    }
  }, [recolhido]);

  const veioDoFuncionario = lerSessao('gerente')?.origemFuncionario === true;

  function handleLogout() {
    logout();
    // Quem veio do painel de funcionário não navega daqui: limpar a sessão já
    // faz o ProtectedRoute devolver a pessoa pra tela dela (é ele quem escolhe o
    // destino, pra não competir com uma navegação disparada aqui).
    if (!veioDoFuncionario) navigate('/');
  }

  function alternarGrupo(rotulo: string) {
    // Recolhido não há onde desenhar submenu: abrir um grupo expande o menu.
    if (recolhido) {
      setRecolhido(false);
      setAbertos((atuais) => [...new Set([...atuais, rotulo])]);
      return;
    }
    setAbertos((atuais) => (atuais.includes(rotulo) ? atuais.filter((r) => r !== rotulo) : [...atuais, rotulo]));
  }

  const podeVer = (item: ItemMenu) => !item.somentePara || (perfil ? item.somentePara.includes(perfil) : false);

  return (
    <div className={`painel${recolhido ? ' painel--recolhido' : ''}${gavetaAberta ? ' painel--gaveta' : ''}`}>
      <button className="painel-veu" aria-label="Fechar menu" onClick={() => setGavetaAberta(false)} />

      <aside className="menu-lateral">
        <div className="menu-topo">
          <div className="menu-marca">
            <BrandLogo />
          </div>
          <button
            className="menu-recolher"
            onClick={() => setRecolhido((v) => !v)}
            title={recolhido ? 'Expandir menu' : 'Recolher menu'}
            aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
          >
            {recolhido ? '»' : '«'}
          </button>
        </div>

        <nav className="menu-nav">
          {grupos.map((grupo) => {
            const itens = grupo.itens.filter(podeVer);
            if (!itens.length) return null;
            const aberto = abertos.includes(grupo.rotulo) && !recolhido;

            return (
              <div className="menu-grupo" key={grupo.rotulo}>
                <button
                  className={`menu-grupo-titulo${grupoTemAtivo(grupo) ? ' tem-ativo' : ''}`}
                  onClick={() => alternarGrupo(grupo.rotulo)}
                  title={recolhido ? grupo.rotulo : undefined}
                  aria-expanded={aberto}
                >
                  <span className="menu-icone">{grupo.icone}</span>
                  <span className="menu-rotulo">{grupo.rotulo}</span>
                  <span className={`menu-seta${aberto ? ' aberta' : ''}`}>›</span>
                </button>

                {/*
                  O wrapper interno existe pro fecha/abre animar: o truque de
                  `grid-template-rows: 0fr → 1fr` só controla a PRIMEIRA linha do
                  grid, então sem ele cada item viraria uma linha própria (auto)
                  e o grupo nunca fecharia.
                */}
                <div className={`menu-itens${aberto ? ' aberta' : ''}`}>
                  <div className="menu-itens-interno">
                  {itens.map((item) =>
                    item.externo ? (
                      <a
                        key={item.para}
                        className="menu-item"
                        href={item.para}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={item.rotulo}
                      >
                        <span className="menu-icone">{item.icone}</span>
                        <span className="menu-rotulo">{item.rotulo}</span>
                        <span className="menu-externo">↗</span>
                      </a>
                    ) : (
                      <NavLink
                        key={item.para}
                        to={item.para}
                        end={item.exato}
                        className={({ isActive }) => `menu-item${isActive ? ' ativo' : ''}`}
                        title={item.rotulo}
                      >
                        <span className="menu-icone">{item.icone}</span>
                        <span className="menu-rotulo">{item.rotulo}</span>
                      </NavLink>
                    ),
                  )}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="menu-rodape">
          <div className="menu-usuario" title={usuario?.nome}>
            <span className="menu-avatar">{usuario?.icone ?? '👤'}</span>
            <span className="menu-rotulo">
              <strong>{usuario?.nome}</strong>
              <small>{perfil ? PERFIL_LABEL[perfil] : ''}</small>
            </span>
          </div>
          <button className="menu-sair" onClick={handleLogout} title="Sair">
            <span className="menu-icone">⏻</span>
            <span className="menu-rotulo">Sair</span>
          </button>
        </div>
      </aside>

      <div className="painel-conteudo">
        <header className="painel-barra">
          <button className="menu-abrir" onClick={() => setGavetaAberta(true)} aria-label="Abrir menu" title="Abrir menu">
            ☰
          </button>
          <div className="painel-marca-mobile">
            <BrandLogo />
          </div>
        </header>

        <main className="painel-main">
          {/*
            O título vem do próprio menu: a tela ativa já tem rótulo e grupo ali,
            e repetir isso em cada página seria mais um lugar pra desencontrar.
          */}
          {ativo && (
            <div className="painel-titulo">
              <span className="painel-trilha">{ativo.grupo}</span>
              <h1>{ativo.item.rotulo}</h1>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
