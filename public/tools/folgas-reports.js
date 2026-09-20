// ---------- Relatórios (Excel / PDF) ----------
// Cada relatório monta seus próprios dados (não lê da tabela renderizada),
// pra funcionar igual em qualquer navegador e ficar limpo pra exportação
// (sem os botões de ação, badges de status etc. que aparecem na tela).
const REPORTS = {
  activeLeaves: {
    title: 'Ausências agora (férias-atestado)',
    build(){
      const today = todayStr();
      const rows = state.leaves
        .filter(l=> today >= l.startDate && today <= l.endDate)
        .map(l=>{
          const emp = state.employees.find(e=>e.id===l.employeeId);
          return [emp?emp.name:'—', LEAVE_LABELS[l.type]||l.type, fmtDateBr(l.endDate)];
        });
      return { headers: ['Colaborador','Tipo','Até'], rows };
    }
  },
  sickSummary: {
    title: 'Relatório de dias ausentes por doença-atestado',
    build(){
      const rows = state.employees.map(emp=>{
        const atestados = state.leaves.filter(l=> l.employeeId===emp.id && l.type==='atestado' && dentroDoPeriodo(l.startDate));
        const totalDays = atestados.reduce((s,l)=> s + daysBetweenInclusive(l.startDate, l.endDate), 0);
        return { emp, count: atestados.length, totalDays };
      }).filter(s=> s.count > 0).sort((a,b)=> b.totalDays - a.totalDays)
        .map(s=> [s.emp.name, s.count, s.totalDays]);
      return { headers: ['Colaborador','Nº de atestados','Total de dias ausente'], rows };
    }
  },
  sickDetail: {
    title: 'Detalhamento de cada atestado',
    build(){
      const rows = state.leaves.filter(l=> l.type==='atestado' && dentroDoPeriodo(l.startDate))
        .slice().sort((a,b)=> new Date(b.startDate)-new Date(a.startDate))
        .map(l=>{
          const emp = state.employees.find(e=>e.id===l.employeeId);
          return [
            emp?emp.name:'—',
            l.createdAt ? fmtDateTimeBr(l.createdAt) : '—',
            fmtDateBr(l.startDate),
            fmtDateBr(l.endDate),
            daysBetweenInclusive(l.startDate, l.endDate),
            l.note || '—',
          ];
        });
      return { headers: ['Colaborador','Registrado em','Ausente de','Ausente até','Dias','Motivo'], rows };
    }
  },
  balance: {
    title: 'Saldo por colaborador',
    build(){
      const rows = state.employees.map(emp=>{
        const earned = creditsOf(emp.id).length;
        const used = scheduledOf(emp.id).length;
        return [emp.name, earned, used, earned - used];
      });
      return { headers: ['Colaborador','Créditos','Usadas','Saldo'], rows };
    }
  },
  scheduled: {
    title: 'Folgas agendadas',
    build(){
      const rows = state.daysOff.filter(off=> dentroDoPeriodo(off.date)).sort((a,b)=> new Date(a.date)-new Date(b.date))
        .map(off=>{
          const emp = state.employees.find(e=>e.id===off.employeeId);
          return [emp?emp.name:'—', fmtDateBr(off.date), weekdayName(off.date)];
        });
      return { headers: ['Colaborador','Data','Dia da semana'], rows };
    }
  },
  credits: {
    title: 'Histórico de créditos concedidos',
    build(){
      const usedDateByCredit = pairCreditsWithDaysOff();
      const rows = state.credits.filter(c=> dentroDoPeriodo(c.workedDate)).sort((a,b)=> new Date(b.workedDate)-new Date(a.workedDate))
        .map(c=>{
          const emp = state.employees.find(e=>e.id===c.employeeId);
          const usedDate = usedDateByCredit.get(c.id);
          return [emp?emp.name:'—', fmtDateBr(c.workedDate), c.note || '—', usedDate ? fmtDateBr(usedDate) : 'Disponível'];
        });
      return { headers: ['Colaborador','Trabalhou em','Observação','Vai folgar em / Status'], rows };
    }
  },
  swaps: {
    title: 'Folgas trocadas por pagamento',
    build(){
      const rows = state.creditSwaps.filter(s=> dentroDoPeriodo(s.createdAt)).sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt))
        .map(s=>{
          const emp = state.employees.find(e=>e.id===s.employeeId);
          return [emp?emp.name:'—', fmtDateBr(s.workedDate), fmtDateTimeBr(s.createdAt), 'R$ ' + fmtMoney(s.valor), FORMA_PAGAMENTO_FOLGA_LABEL[s.forma]||s.forma, s.nota || '—'];
        });
      return { headers: ['Colaborador','Trabalhou em','Trocada em','Valor','Forma','Observação'], rows };
    }
  },
};

function nomeArquivo(base, ext){
  return base.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') + '-' + todayStr() + '.' + ext;
}

function baixarRelatorioExcel(chave){
  const { title, build } = REPORTS[chave];
  const { headers, rows } = build();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0,31));
  XLSX.writeFile(wb, nomeArquivo(title, 'xlsx'));
}

// A fonte padrão do jsPDF (Helvetica/WinAnsi) só cobre Latin-1 — qualquer
// emoji (🏖️, 🩹 etc, usados nos rótulos de férias/atestado) vira caractere
// corrompido no PDF. Não acontece no Excel (UTF-8) nem na tela, só no PDF —
// por isso limpamos só aqui, mantendo o emoji nos outros lugares.
function limparParaPdf(valor){
  if(valor === null || valor === undefined) return valor;
  if(typeof valor !== 'string') return valor;
  return valor.replace(/[^\x00-\xFF]/g, '').replace(/\s{2,}/g, ' ').trim();
}
function limparTabelaParaPdf(headers, rows){
  return {
    headers: headers.map(limparParaPdf),
    rows: rows.map(row => row.map(limparParaPdf)),
  };
}

function baixarRelatorioPdf(chave){
  const { title, build } = REPORTS[chave];
  const dados = build();
  const { headers, rows } = limparTabelaParaPdf(dados.headers, dados.rows);
  const doc = new window.jspdf.jsPDF();
  doc.setFontSize(13);
  doc.text(limparParaPdf(title), 14, 15);
  doc.autoTable({ head: [headers], body: rows.length ? rows : [['Nenhum dado encontrado.']], startY: 20, styles: { fontSize: 9 } });
  doc.save(nomeArquivo(title, 'pdf'));
}

document.querySelectorAll('.btn-report').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const { report, fmt } = btn.dataset;
    if(fmt === 'xlsx') baixarRelatorioExcel(report);
    else baixarRelatorioPdf(report);
  });
});

document.getElementById('downloadAllXlsxBtn').addEventListener('click', ()=>{
  const wb = XLSX.utils.book_new();
  Object.values(REPORTS).forEach(r=>{
    const { headers, rows } = r.build();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, r.title.slice(0,31));
  });
  XLSX.writeFile(wb, nomeArquivo('relatorios-folgas', 'xlsx'));
});

document.getElementById('downloadAllPdfBtn').addEventListener('click', ()=>{
  const doc = new window.jspdf.jsPDF();
  let first = true;
  Object.values(REPORTS).forEach(r=>{
    if(!first) doc.addPage();
    first = false;
    const dados = r.build();
    const { headers, rows } = limparTabelaParaPdf(dados.headers, dados.rows);
    doc.setFontSize(13);
    doc.text(limparParaPdf(r.title), 14, 15);
    doc.autoTable({ head: [headers], body: rows.length ? rows : [['Nenhum dado encontrado.']], startY: 20, styles: { fontSize: 9 } });
  });
  doc.save(nomeArquivo('relatorios-folgas', 'pdf'));
});

async function cancelScheduled(offId){
  if(!(await showConfirm('Cancelar essa folga agendada? O crédito volta pro saldo do colaborador.'))) return;
  const off = state.daysOff.find(d=>d.id===offId);
  const emp = off ? state.employees.find(e=>e.id===off.employeeId) : null;
  state.daysOff = state.daysOff.filter(d=>d.id!==offId);
  await saveState();
  await logAction('Apagou folga agendada', (emp?emp.name:'—') + ' — dia ' + (off?fmtDateBr(off.date):'?'));
  renderManagerView();
}
async function deleteCredit(creditId){
  if(!(await showConfirm('Remover este crédito? Se ele já tiver sido usado numa folga, o saldo do colaborador pode ficar negativo — ajuste com cuidado.'))) return;
  const cred = state.credits.find(c=>c.id===creditId);
  const emp = cred ? state.employees.find(e=>e.id===cred.employeeId) : null;
  state.credits = state.credits.filter(c=>c.id!==creditId);
  await saveState();
  await logAction('Removeu crédito de folga', (emp?emp.name:'—') + ' — trabalhou em ' + (cred?fmtDateBr(cred.workedDate):'?'));
  renderManagerView();
}

// ---------- Init ----------
const TELAS_ERRO_CARREGAMENTO = {
  'sem-sessao': {
    icone: '🔒',
    titulo: 'Faça login no PharmaMind primeiro',
    texto: 'Essa ferramenta usa a sua sessão do PharmaMind pra saber de qual farmácia são os dados. Entre por um dos links abaixo (abre numa aba nova) e depois volte aqui e recarregue.',
    mostrarLinksLogin: true,
    botao: null,
  },
  'sessao-expirada': {
    icone: '⚠️',
    titulo: 'Sua sessão do PharmaMind expirou',
    texto: 'O login expira depois de algumas horas. Entre de novo por um dos links abaixo (abre numa aba nova) e depois volte aqui e clique em recarregar.',
    mostrarLinksLogin: true,
    botao: '🔄 Recarregar agora',
  },
  'erro-conexao': {
    icone: '📡',
    titulo: 'Não foi possível carregar os dados',
    texto: 'Houve um problema de conexão com o servidor. Confira sua internet e tente de novo — enquanto isso não for resolvido, nada digitado aqui vai ser salvo.',
    mostrarLinksLogin: false,
    botao: '🔄 Tentar de novo',
  },
};

(async function init(){
  await loadState();

  // Nunca deixa a pessoa usar a ferramenta achando que os dados são "do
  // zero" quando na real é só que não conseguimos carregar os de verdade —
  // isso é o que fazia parecer que "nada salvava" quando a sessão expirava.
  if(loadErro){
    const tela = TELAS_ERRO_CARREGAMENTO[loadErro];
    const linksLogin = tela.mostrarLinksLogin ? `
      <div style="display:flex;gap:10px;justify-content:center;margin:16px 0;flex-wrap:wrap;">
        <a class="btn-ghost" style="display:inline-block;text-decoration:none;" href="${urlLoginPharmaMind(false)}" target="_blank" rel="noopener noreferrer">🧑‍💼 Entrar como funcionário</a>
        <a class="btn-ghost" style="display:inline-block;text-decoration:none;" href="${urlLoginPharmaMind(true)}" target="_blank" rel="noopener noreferrer">🔐 Entrar como gestor</a>
      </div>
    ` : '';
    document.getElementById('codeGate').innerHTML = `
      <div class="gate-icon">${tela.icone}</div>
      <h2>${tela.titulo}</h2>
      <p>${tela.texto}</p>
      ${linksLogin}
      ${tela.botao ? '<button class="btn-primary" id="recarregarAppBtn">' + tela.botao + '</button>' : ''}
    `;
    if(tela.botao) document.getElementById('recarregarAppBtn').addEventListener('click', ()=> location.reload());
    showOnly(employeeView);
    return;
  }

  showOnly(employeeView);
  identificarSessaoAtual();
})();
