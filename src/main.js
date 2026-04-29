import './style.css';
import { supabase } from './lib/supabase.js';

const DEPARTAMENTOS = [
  "Criancas", "Adolescentes", "Jovens", "Senhoras", "Varoes", "Louvor",
  "Musica", "Ensino", "Missoes", "Evangelismo", "Intercessao", "Obreiros",
  "Diaconato", "Secretaria", "Tesouraria", "Portaria", "Midia", "Limpeza"
];

const CONGREGRACOES = [
  "Alto da Vitória", "Areal", "Barro Branco", "Castro", "Curralinho", "Diogo",
  "Estiva", "Foz do Imbassai", "Haras", "Imbassai", "Jardim Imbassai", "Patioba",
  "Santo Antônio", "Sauipe (Sede)", "Sitio Santo Antônio", "Vila Mar", "Vila Margarida", "Todo o Campo"
];


const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

let evCurrentMonth = new Date().getMonth();
let evCurrentYear = new Date().getFullYear();

let historyStack = [localStorage.getItem('ad_sauipe_membros') || '[]'];
let historyIndex = 0;
let membros = JSON.parse(historyStack[0]);
let eventos = JSON.parse(localStorage.getItem('ad_sauipe_eventos') || '[]');

// Utility to find N-th day of week in a month
function getNthDayOfMonth(year, month, nth, dayOfWeek) {
    let date = new Date(year, month, 1);
    let count = 0;
    while (date.getMonth() === month) {
        if (date.getDay() === dayOfWeek) {
            count++;
            if (count === nth) return new Date(date);
        }
        date.setDate(date.getDate() + 1);
    }
    return null;
}

// --- localStorage (cache local para undo/redo e offline) ---
function salvarMembrosLocal() {
   localStorage.setItem('ad_sauipe_membros', JSON.stringify(membros));
}

function salvarEventosLocal() {
   localStorage.setItem('ad_sauipe_eventos', JSON.stringify(eventos));
}

// --- Sanitização de tipos para Supabase ---
// Postgres rejeita string vazia "" em campos DATE/TIMESTAMPTZ — precisa ser null
function sanitizarMembro(m) {
   return {
      id: m.id,
      nome: m.nome || null,
      congregacao: m.congregacao || null,
      data_jesus: m.data_jesus || null,
      data_batismo: m.data_batismo || null,   // DATE: nunca enviar ""
      tem_cargo: !!m.tem_cargo,
      cargos: m.cargos || [],
      pai: m.pai || null,
      mae: m.mae || null,
      nascimento: m.nascimento || null,       // DATE: nunca enviar ""
      nacionalidade: m.nacionalidade || null,
      sexo: m.sexo || null,
      estado_civil: m.estado_civil || null,
      casamento: m.casamento || null,          // DATE: nunca enviar ""
      rg: m.rg || null,
      cpf: m.cpf || null,
      telefone: m.telefone || null,
      telefone2: m.telefone2 || null,
      contato_emergencia_nome: m.contato_emergencia_nome || null,
      contato_emergencia_tel: m.contato_emergencia_tel || null,
      data_carteirinha: m.data_carteirinha || null,   // DATE: nunca enviar ""
      obs_carteirinha: m.obs_carteirinha || null,
      eca: m.eca || { entregue: false, link: '', data: '' },
      data_cadastro: m.data_cadastro || new Date().toISOString(),
   };
}

function sanitizarEvento(ev) {
   return {
      id: ev.id,
      nome: ev.nome || null,
      local: ev.local || null,
      alcance: ev.alcance || null,
      congregacao: ev.congregacao || null,
      congregacao_sede: ev.congregacao_sede || null,
      regras: ev.regras || {},
      cartaz: ev.cartaz || null,
      responsaveis: ev.responsaveis || [],
      historico: ev.historico || [],
      data_criacao: ev.data_criacao || new Date().toISOString(),
   };
}

function withTimeout(promise, ms, label) {
   let timer;
   const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} demorou para responder`)), ms);
   });
   return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// --- Supabase CRUD ---
// Para cadastros novos (anônimos) — usa INSERT puro (não upsert)
async function dbInserirMembro(m) {
   const payload = sanitizarMembro(m);
   const { error } = await supabase.from('membros').insert(payload);
   if (error) {
      console.error('Erro inserirMembro:', error.message, error.details);
      return false;
   }
   return true;
}

// Para edições de admin — usa UPSERT (requer autenticação)
async function dbSalvarMembro(m) {
   const payload = sanitizarMembro(m);
   const { error } = await supabase.from('membros').upsert(payload);
   if (error) {
      console.error('Erro salvarMembro:', error.message, error.details);
      return false;
   }
   return true;
}

async function dbExcluirMembro(id) {
   const { error } = await supabase.from('membros').delete().eq('id', id);
   if (error) console.error('Erro excluirMembro:', error.message);
}

async function dbSalvarEvento(ev) {
   const payload = sanitizarEvento(ev);
   const { error } = await supabase.from('eventos').upsert(payload);
   if (error) console.error('Erro salvarEvento:', error.message, error.details);
}

async function dbExcluirEvento(id) {
   const { error } = await supabase.from('eventos').delete().eq('id', id);
   if (error) console.error('Erro excluirEvento:', error.message);
}

// Wrapper síncrono para uso normal — salva local imediatamente, envia ao Supabase em background
function salvarMembros() {
   salvarMembrosLocal();
   // fire-and-forget para cada membro modificado recentemente — pushHistory chama isso
}

function salvarEventos() {
   salvarEventosLocal();
}

function pushHistory() {
    const stateStr = JSON.stringify(membros);
    if(stateStr === historyStack[historyIndex]) return;
    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push(stateStr);
    if(historyStack.length > 50) historyStack.shift();
    historyIndex = historyStack.length - 1;
    salvarMembros();
}

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        if (historyIndex > 0) {
            historyIndex--;
            membros = JSON.parse(historyStack[historyIndex]);
            salvarMembros();
            renderCRM();
            if(document.getElementById('modal-editar').style.display === 'block') {
               abrirEdicao(document.getElementById('edit-id').value);
            }
        }
    } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            membros = JSON.parse(historyStack[historyIndex]);
            salvarMembros();
            renderCRM();
            if(document.getElementById('modal-editar').style.display === 'block') {
               abrirEdicao(document.getElementById('edit-id').value);
            }
        }
    }
});

// --- Navigation & Auth ---
const viewForm = document.getElementById('view-form');
const viewCrm = document.getElementById('view-crm');
const viewEventos = document.getElementById('view-eventos');
const viewSuccess = document.getElementById('view-success');
const btnNavForm = document.getElementById('btn-nav-form');
const btnNavCrm = document.getElementById('btn-nav-crm');
const btnNavEventos = document.getElementById('btn-nav-eventos');
const modalLogin = document.getElementById('modal-login');
const btnLogin = document.getElementById('btn-login');

// Auth com permissões
let currentUser = null;
let userRole = null;
let isAdminAuthed = false;

function switchView(view) {
  if (view === 'form') {
    viewForm.style.display = 'block';
    viewCrm.style.display = 'none';
    viewEventos.style.display = 'none';
    viewSuccess.style.display = 'none';
    btnNavForm.classList.add('active');
    btnNavCrm.classList.remove('active');
    btnNavEventos.classList.remove('active');
    document.querySelector('.navbar').style.display = 'flex';
  } else if (view === 'eventos') {
    viewEventos.style.display = 'block';
    viewForm.style.display = 'none';
    viewCrm.style.display = 'none';
    viewSuccess.style.display = 'none';
    btnNavEventos.classList.add('active');
    btnNavForm.classList.remove('active');
    btnNavCrm.classList.remove('active');
    // Reset to Eventos tab
    const tabEv = document.getElementById('ev-tab-eventos');
    const tabAniv = document.getElementById('ev-tab-aniversariantes');
    const contEv = document.getElementById('ev-content-eventos');
    const contAniv = document.getElementById('ev-content-aniversariantes');
    if (tabEv) tabEv.classList.add('active');
    if (tabAniv) tabAniv.classList.remove('active');
    if (contEv) contEv.style.display = 'block';
    if (contAniv) contAniv.style.display = 'none';
    renderEventos();
  } else if (view === 'crm') {
    if (!isAdminAuthed || userRole !== 'admin') {
      alert('❌ Você não tem permissão para acessar o CRM. Apenas administradores.');
      return;
    }
    viewCrm.style.display = 'block';
    viewForm.style.display = 'none';
    viewEventos.style.display = 'none';
    viewSuccess.style.display = 'none';
    btnNavCrm.classList.add('active');
    btnNavForm.classList.remove('active');
    btnNavEventos.classList.remove('active');
    renderCRM();
  } else if (view === 'success') {
    viewSuccess.style.display = 'block';
    viewForm.style.display = 'none';
    viewCrm.style.display = 'none';
    viewEventos.style.display = 'none';
    document.querySelector('.navbar').style.display = 'none';
  }
}

btnNavForm.addEventListener('click', () => switchView('form'));
btnNavCrm.addEventListener('click', () => {
   if (!isAdminAuthed) {
      // Não logado: abre modal de login
      modalLogin.style.display = 'flex';
   } else {
      // Logado como admin: vai para CRM
      switchView('crm');
   }
});
btnNavEventos.addEventListener('click', () => switchView('eventos'));

// --- Autenticação com Supabase Auth ---
async function loginAdmin(email, password) {
   try {
      const { data, error } = await supabase.auth.signInWithPassword({
         email,
         password
      });

      if (error) {
         alert('❌ Email ou senha incorretos: ' + error.message);
         return;
      }

      currentUser = data.user;
      isAdminAuthed = true;

      // Buscar role do usuário
      const { data: roleData, error: roleError } = await supabase
         .from('user_roles')
         .select('role')
         .eq('id', currentUser.id)
         .single();

      if (roleError) {
         console.warn('Role não encontrada, usando viewer:', roleError);
         userRole = 'viewer';
      } else {
         userRole = roleData?.role || 'viewer';
      }

      console.log(`✅ Logado como ${email} (role: ${userRole})`);
      modalLogin.style.display = 'none';
      updateAdminUI();
      updateUIByRole();

      // Recarrega membros do Supabase (RLS libera após autenticação)
      try {
         const { data: dbMembros, error: errM } = await supabase.from('membros').select('*');
         if (!errM && dbMembros) {
            membros = dbMembros;
            historyStack = [JSON.stringify(membros)];
            historyIndex = 0;
            salvarMembrosLocal();
            console.log(`📋 ${membros.length} membro(s) carregado(s) após login`);
         }
      } catch (e) {
         console.warn('Não foi possível recarregar membros:', e);
      }

      renderCRM();
      renderEventos();

      if(modalLogin.getAttribute('data-target') === 'evento') {
         modalLogin.removeAttribute('data-target');
         abrirModalEvento();
      } else {
         switchView('crm');
      }
   } catch (err) {
      console.error('Erro ao fazer login:', err);
      alert('Erro ao fazer login: ' + err.message);
   }
}

async function logoutAdmin() {
   try {
      await supabase.auth.signOut();
      currentUser = null;
      userRole = null;
      isAdminAuthed = false;
      updateAdminUI();
      updateUIByRole();
      switchView('form');
      console.log('✅ Deslogado');
   } catch (err) {
      console.error('Erro ao fazer logout:', err);
   }
}

function updateAdminUI() {
   const adminLabel = document.getElementById('admin-user-label');
   if (adminLabel) {
      if (currentUser) {
         adminLabel.innerHTML = `<span style="color: #10b981; font-weight: 600;">✅ ${currentUser.email}</span><br><small>${userRole}</small>`;
      } else {
         adminLabel.innerHTML = 'Não autenticado';
      }
   }
}

function updateUIByRole() {
   const btnAddEvento = document.getElementById('btn-open-add-evento');
   const btnImportEvento = document.getElementById('btn-open-import-evento');
   const btnNavCrm = document.getElementById('btn-nav-crm');
   const btnLogout = document.getElementById('btn-logout');

   // O btn-nav-crm SEMPRE aparece: sem login abre modal, com login admin vai ao CRM
   if (btnNavCrm) {
      btnNavCrm.style.display = 'block';
      btnNavCrm.textContent = isAdminAuthed && userRole === 'admin' ? '📋 Painel' : '🔐 Acesso Admin';
   }

   if (!isAdminAuthed) {
      if (btnAddEvento) btnAddEvento.style.display = 'none';
      if (btnImportEvento) btnImportEvento.style.display = 'none';
      if (btnLogout) btnLogout.style.display = 'none';
      return;
   }

   if (userRole === 'admin') {
      if (btnAddEvento) btnAddEvento.style.display = 'block';
      if (btnImportEvento) btnImportEvento.style.display = 'block';
      if (btnLogout) btnLogout.style.display = 'block';
   } else if (userRole === 'coordenador') {
      if (btnAddEvento) btnAddEvento.style.display = 'block';
      if (btnImportEvento) btnImportEvento.style.display = 'block';
      if (btnNavCrm) btnNavCrm.style.display = 'none'; // Coordenador não acessa Painel
      if (btnLogout) btnLogout.style.display = 'block';
   } else {
      if (btnAddEvento) btnAddEvento.style.display = 'none';
      if (btnImportEvento) btnImportEvento.style.display = 'none';
      if (btnLogout) btnLogout.style.display = 'none';
   }
}

btnLogin.addEventListener('click', async () => {
   const email = document.getElementById('admin-email').value.trim();
   const password = document.getElementById('admin-pass').value;

   if (!email || !password) {
      alert('Preencha email e senha!');
      return;
   }

   await loginAdmin(email, password);
});

modalLogin.addEventListener('click', (e) => {
   if(e.target === modalLogin) {
      modalLogin.style.display = 'none';
   }
});

// --- Form principal de cadastro ---
const memberForm = document.getElementById('member-form');

// --- Dynamic Form Logic ---
const estadoCivil = document.getElementById('estado_civil');
const containerCasamento = document.getElementById('container-casamento');
const inputCasamento = document.getElementById('casamento');

estadoCivil.addEventListener('change', (e) => {
   if (e.target.value.includes('Casado')) {
      containerCasamento.style.display = 'flex';
      inputCasamento.setAttribute('required', 'true');
   } else {
      containerCasamento.style.display = 'none';
      inputCasamento.removeAttribute('required');
      inputCasamento.value = '';
   }
});

const nacionalidade = document.getElementById('nacionalidade');
const nacOutro = document.getElementById('nacionalidade_outro');
nacionalidade.addEventListener('change', (e) => {
   if(e.target.value === 'Outro') {
      nacOutro.style.display = 'block';
      nacOutro.setAttribute('required', 'true');
   } else {
      nacOutro.style.display = 'none';
      nacOutro.removeAttribute('required');
   }
});

const checkCargo = document.getElementById('tem-cargo');
const cargosContainer = document.getElementById('cargos-container');
const containerDocs = document.getElementById('container-documentos');
const rgInput = document.getElementById('rg');
const cpfInput = document.getElementById('cpf');
const btnAddCargo = document.getElementById('btn-add-cargo');
const listaCargos = document.getElementById('lista-cargos');

// Initial setup with 1 cargo field pair
adicionarCampoCargo();

checkCargo.addEventListener('change', (e) => {
   if (e.target.checked) {
      cargosContainer.style.display = 'block';
   } else {
      cargosContainer.style.display = 'none';
      document.querySelectorAll('.cargo-f, .cargo-d').forEach(i => i.value = '');
   }
});

function adicionarCampoCargo() {
   const div = document.createElement('div');
   div.className = 'input-row cargo-row';
   div.style.marginBottom = '10px';
   div.innerHTML = `
     <div class="input-group" style="flex: 1.2;">
        <input type="text" class="cargo-f uppercase-field" placeholder="CARGO (Ex: Líder)" style="margin-bottom:0;">
     </div>
     <div class="input-group" style="flex: 1;">
         <input type="text" class="cargo-d uppercase-field" placeholder="DEPART. (Ex: Jovens)" style="margin-bottom:0;">
     </div>
     <div class="input-group" style="flex: 1;">
        <select class="cargo-c" style="margin-bottom:0;">
           <option value="" disabled selected>Onde exerce?</option>
           ${CONGREGRACOES.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
     </div>
   `;
   
   div.querySelectorAll('input').forEach(inp => inp.addEventListener('input', uppercaseListener));
   listaCargos.appendChild(div);
}

btnAddCargo.addEventListener('click', adicionarCampoCargo);

// --- Always Uppercase Inputs ---
function uppercaseListener(e) {
  const start = e.target.selectionStart;
  const end = e.target.selectionEnd;
  e.target.value = e.target.value.toUpperCase();
  e.target.setSelectionRange(start, end);
}

document.querySelectorAll('input[type="text"]').forEach(input => {
   input.addEventListener('input', uppercaseListener);
});


// --- Masks ---
function applyMask(input, maskFn) {
  input.addEventListener('input', (e) => {
    e.target.value = maskFn(e.target.value);
  });
}

function phoneMask(v) {
  v = v.replace(/\D/g, '');
  if (v.length > 11) v = v.slice(0, 11);
  v = v.replace(/^(\d\d)(\d)/g, '($1) $2');
  v = v.replace(/(\d{5})(\d)/, '$1-$2');
  return v;
}

function cpfMask(v) {
  v = v.replace(/\D/g, '');
  if (v.length > 11) v = v.slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return v;
}

applyMask(document.getElementById('telefone'), phoneMask);
applyMask(document.getElementById('telefone2'), phoneMask);
applyMask(document.getElementById('cpf'), cpfMask);
applyMask(document.getElementById('contato_emergencia_tel'), phoneMask);

applyMask(document.getElementById('edit-telefone'), phoneMask);
applyMask(document.getElementById('edit-telefone2'), phoneMask);
applyMask(document.getElementById('edit-cpf'), cpfMask);
applyMask(document.getElementById('edit-contato-emergencia-tel'), phoneMask);

// --- Form Submission ---
// --- Review and Confirmation Flow ---
const modalConfirmar = document.getElementById('modal-confirmar');
const confirmResumo = document.getElementById('confirmar-resumo');
const btnConfirmarCorrigir = document.getElementById('btn-confirmar-corrigir');
const btnConfirmarEnviar = document.getElementById('btn-confirmar-enviar');

let pendingMembro = null;

memberForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  // Extract Cargos
  let cargosObj = [];
  if (checkCargo.checked) {
      document.querySelectorAll('.cargo-row').forEach(row => {
         const f = row.querySelector('.cargo-f').value.trim();
         const d = row.querySelector('.cargo-d').value.trim();
         const c = row.querySelector('.cargo-c').value;
         if (f || d || c) cargosObj.push({ 
             cargo: f.toUpperCase(), 
             departamento: d.toUpperCase(),
             congregacao: c
         });
      });
  }
  
  let fNac = nacionalidade.value;
  if(fNac === 'Outro') fNac = nacOutro.value.toUpperCase();

  let jesusM = document.getElementById('jesus_mes').value;
  let jesusA = document.getElementById('jesus_ano').value;
  let jesusStr = jesusA ? (jesusM ? `${jesusM}/${jesusA}` : jesusA) : '';
  
  pendingMembro = {
    id: Date.now().toString(),
    nome: document.getElementById('nome').value.toUpperCase(),
    congregacao: document.getElementById('congregacao').value,
    data_jesus: jesusStr,
    data_batismo: document.getElementById('data_batismo').value,
    tem_cargo: checkCargo.checked,
    cargos: cargosObj,
    
    pai: document.getElementById('pai').value.toUpperCase(),
    mae: document.getElementById('mae').value.toUpperCase(),
    
    nascimento: document.getElementById('nascimento').value, 
    nacionalidade: fNac,
    sexo: document.getElementById('sexo').value,
    estado_civil: document.getElementById('estado_civil').value,
    casamento: document.getElementById('casamento').value,
    
    rg: document.getElementById('rg').value.toUpperCase(),
    cpf: document.getElementById('cpf').value,
    
    telefone: document.getElementById('telefone').value,
    telefone2: document.getElementById('telefone2').value,
    
    contato_emergencia_nome: document.getElementById('contato_emergencia_nome').value.toUpperCase(),
    contato_emergencia_tel: document.getElementById('contato_emergencia_tel').value,
    
    eca: { entregue: false, link: '', data: '' },
    data_cadastro: new Date().toISOString()
  };

  renderResumoConfirmacao(pendingMembro);
  modalConfirmar.style.display = 'block';
});

function renderResumoConfirmacao(m) {
    function fmtData(s) {
        if (!s) return '—';
        const [y, mo, d] = s.split('-');
        return `${d}/${mo}/${y}`;
    }
    function row(label, valor, destaque) {
        if (!valor) return '';
        return `<div class="conf-row${destaque ? ' conf-row-destaque' : ''}">
            <span class="conf-label">${label}</span>
            <span class="conf-val">${valor}</span>
        </div>`;
    }
    function sec(titulo) {
        return `<div class="conf-sec-title">${titulo}</div>`;
    }

    const cargosStr = m.cargos && m.cargos.length > 0
        ? m.cargos.map(c => {
            let s = c.cargo || '';
            if (c.departamento && c.departamento !== '-') s += ` — ${c.departamento}`;
            if (c.congregacao) s += ` (${c.congregacao})`;
            return s;
          }).join('<br>')
        : 'Membro';

    confirmResumo.innerHTML = `
        ${sec('<i class="ri-church-line"></i> Dados da Igreja')}
        ${row('Nome Completo', `<b>${m.nome}</b>`, true)}
        ${row('Congregação', m.congregacao)}
        ${row('Cargo(s) / Função', cargosStr)}
        ${row('Aceitou Jesus em', m.data_jesus)}
        ${row('Data de Batismo', `<b>${fmtData(m.data_batismo)}</b>`, true)}

        ${sec('<i class="ri-profile-line"></i> Dados Pessoais')}
        ${row('Data de Nascimento', `<b>${fmtData(m.nascimento)}</b>`, true)}
        ${row('Sexo', m.sexo)}
        ${row('Estado Civil', m.estado_civil)}
        ${m.casamento ? row('Aniv. Casamento', fmtData(m.casamento)) : ''}
        ${row('Nacionalidade', m.nacionalidade)}
        ${row('Nome do Pai', m.pai || '—')}
        ${row('Nome da Mãe', m.mae || '—')}

        ${(m.rg || m.cpf) ? sec('<i class="ri-file-user-line"></i> Documentos') : ''}
        ${row('RG', m.rg)}
        ${row('CPF', m.cpf)}

        ${sec('<i class="ri-phone-line"></i> Contato')}
        ${row('Celular 1', `<b>${m.telefone}</b>`, true)}
        ${row('Celular 2', m.telefone2)}

        ${sec('<i class="ri-user-heart-line"></i> Contato de Emergência')}
        ${row('Nome', `<b>${m.contato_emergencia_nome}</b>`, true)}
        ${row('Telefone', m.contato_emergencia_tel)}

        <div class="conf-aviso">
            <i class="ri-error-warning-fill"></i>
            <span>Verifique tudo com atenção! Se algum dado estiver errado, sua carteirinha será impressa incorretamente.</span>
        </div>
    `;
}

btnConfirmarCorrigir.addEventListener('click', () => {
    modalConfirmar.style.display = 'none';
});

btnConfirmarEnviar.addEventListener('click', async () => {
    if (!pendingMembro) return;
    const m = pendingMembro;
    pendingMembro = null;

    // Desabilita botão enquanto envia
    btnConfirmarEnviar.disabled = true;
    btnConfirmarEnviar.innerHTML = '<i class="ri-loader-4-line" style="animation: spin 1s linear infinite;"></i> Enviando...';

    const ok = await dbInserirMembro(m);

    btnConfirmarEnviar.disabled = false;
    btnConfirmarEnviar.innerHTML = '<i class="ri-check-double-line"></i> Confirmar e Enviar';

    if (!ok) {
        alert('❌ Erro ao salvar no servidor. Verifique sua conexão e tente novamente.');
        pendingMembro = m; // restaura para tentar novamente
        return;
    }

    membros.push(m);
    salvarMembros();
    modalConfirmar.style.display = 'none';
    memberForm.reset();
    listaCargos.innerHTML = '';
    adicionarCampoCargo();
    switchView('success');
});

// --- CRM Dashboard ---
const tbody = document.getElementById('membros-tbody');
const searchInput = document.getElementById('search-membro');
const filterCongregacao = document.getElementById('filter-congregacao');
let currentCrmTab = 'todos';

// Tabs Setup
document.querySelectorAll('.tab-btn').forEach(btn => {
   btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      currentCrmTab = e.currentTarget.getAttribute('data-tab');
      renderCRM();
   });
});

searchInput.addEventListener('input', renderCRM);
filterCongregacao.addEventListener('change', renderCRM);

function getEcaStatus(m) {
    if (!EcaRequired(m.cargos)) return null;
    if (!m.eca || !m.eca.validade || !m.eca.link) return 'MISSING';
    
    // Parse validade (sem timezone do navegador)
    const validade = new Date(m.eca.validade + 'T12:00:00Z');
    const hoje = new Date();
    // zerar tempo de hoje para comparacao de data correta
    hoje.setUTCHours(12,0,0,0);
    
    const diffEmTempo = validade.getTime() - hoje.getTime();
    const diffEmDias = diffEmTempo / (1000 * 3600 * 24);
    
    if (diffEmDias < 0) return 'EXPIRED';
    if (diffEmDias <= 15) return 'EXPIRING_SOON';
    return 'OK';
}

function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const [, month, ] = dateStr.split('-');
  const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
  return month === currentMonth;
}

function renderCRM() {
  const searchTerm = searchInput.value.toLowerCase();
  const filterVal = filterCongregacao.value;

  let filtered = membros.filter(m => {
    const matchName = m.nome.toLowerCase().includes(searchTerm) || (m.cpf && m.cpf.includes(searchTerm));
    const matchCongregacao = (filterVal === 'Todos' || m.congregacao === filterVal);
    return matchName && matchCongregacao;
  });

  if (currentCrmTab === 'aniversariantes') {
      filtered = filtered.filter(m => isThisMonth(m.nascimento) || isThisMonth(m.casamento));
  }

  // Render Table
  tbody.innerHTML = '';
  filtered.forEach(m => {
    const isAnivNasc = isThisMonth(m.nascimento);
    const isAnivCas = isThisMonth(m.casamento);
    const hasCargo = m.tem_cargo && m.cargos && m.cargos.length > 0;
    
    let funcaoDisplay = 'Membro';
    if(hasCargo) {
       funcaoDisplay = m.cargos.map(c => `${c.cargo} (${c.departamento})`).join('<br>');
    }

    let anivTags = '';
    if (isAnivNasc) anivTags += '<br><span class="badge" title="Aniversário de Nascimento" style="margin-top:4px; margin-right:4px; display:inline-block;"><i class="ri-cake-2-line"></i> Nasc</span>';
    if (isAnivCas) anivTags += '<br><span class="badge b-pink" title="Aniversário de Casamento" style="color:white; margin-top:4px; margin-right:4px; display:inline-block;"><i class="ri-heart-pulse-fill"></i> Casam</span>';

    const ecaStatus = getEcaStatus(m);
    if(ecaStatus === 'MISSING') {
         anivTags += '<br><span class="badge" title="Sem documento em nuvem preenchido/validade" style="background:#be185d; color:white; margin-top:4px; display:inline-block;"><i class="ri-error-warning-fill"></i> ECA Pendente</span>';
    } else if(ecaStatus === 'EXPIRED') {
         anivTags += '<br><span class="badge" title="Antecedentes Vencidos" style="background:#9f1239; color:white; margin-top:4px; display:inline-block;"><i class="ri-alert-fill"></i> ECA Vencido</span>';
    } else if(ecaStatus === 'EXPIRING_SOON') {
         anivTags += '<br><span class="badge" title="Vence em menos de 15 dias" style="background:#ea580c; color:white; margin-top:4px; display:inline-block;"><i class="ri-timer-line"></i> ECA Vencendo</span>';
    } else if(ecaStatus === 'OK') {
         anivTags += '<br><span class="badge" title="Documento ECA no prazo" style="background:#10b981; color:white; margin-top:4px; display:inline-block;"><i class="ri-shield-check-fill"></i> ECA OK</span>';
    }

    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td>
        <strong>${m.nome}</strong>
        ${anivTags}
      </td>
      <td><span class="badge">${m.congregacao}</span></td>
      <td style="font-size: 0.85rem; line-height:1.2;">${funcaoDisplay}</td>
      <td>${m.telefone} ${m.telefone2 ? `<br><small>${m.telefone2}</small>` : ''}</td>
      <td style="text-align: right; min-width: 130px;">
        <button class="btn-sm btn-carteirinha" data-id="${m.id}" title="Ver Carteirinha"><i class="ri-id-card-line"></i></button>
        <button class="btn-sm btn-delete" data-id="${m.id}" title="Excluir" style="color:var(--primary)"><i class="ri-delete-bin-line"></i></button>
      </td>
    `;
    
    // Row click opens Edit Modal
    tr.addEventListener('click', (e) => {
        // block row click if button was clicked
        if(e.target.closest('button')) return;
        abrirEdicao(m.id);
    });
    
    tbody.appendChild(tr);
  });

  // Bind Buttons
  document.querySelectorAll('.btn-carteirinha').forEach(btn => btn.addEventListener('click', (e) => abrirCarteirinha(e.currentTarget.getAttribute('data-id'))));
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      if (confirm('Tem certeza que deseja excluir este membro?')) {
        membros = membros.filter(m => m.id !== id);
        salvarMembros();
        dbExcluirMembro(id); // background sync
        renderCRM();
      }
    });
  });
}

// --- Logic for Edit Modal & ECA ---
const modalEditar = document.getElementById('modal-editar');
const closeEditarBtn = document.getElementById('close-editar');
closeEditarBtn.onclick = () => modalEditar.style.display = 'none';

function EcaRequired(cargosObj) {
    if(!cargosObj) return false;
    const keywords = ['CRIANÇA', 'CRIANCA', 'INFANTIL', 'ADOLESC', 'JOVEM', 'KIDS', 'JUVENIL', 'MENOR'];
    for(let c of cargosObj) {
        let str = (`${c.departamento} ${c.cargo}`).toUpperCase();
        for(let k of keywords) {
            if(str.includes(k)) return true;
        }
    }
    return false;
}

function abrirEdicao(id) {
    const m = membros.find(x => x.id === id);
    if (!m) return;
    document.getElementById('edit-id').value = m.id;
    document.getElementById('edit-nome').value = m.nome;
    document.getElementById('edit-congregacao').value = m.congregacao;
    document.getElementById('edit-telefone').value = m.telefone || '';
    document.getElementById('edit-telefone2').value = m.telefone2 || '';
    document.getElementById('edit-estado-civil').value = m.estado_civil;
    document.getElementById('edit-data-jesus').value = m.data_jesus || '';
    document.getElementById('edit-data-batismo').value = m.data_batismo || '';
    document.getElementById('edit-rg').value = m.rg || '';
    document.getElementById('edit-cpf').value = m.cpf || '';
    document.getElementById('edit-contato-emergencia-nome').value = m.contato_emergencia_nome || '';
    document.getElementById('edit-contato-emergencia-tel').value = m.contato_emergencia_tel || '';
    document.getElementById('edit-data-carteirinha').value = m.data_carteirinha || '';
    document.getElementById('edit-obs-carteirinha').value = m.obs_carteirinha || '';
    
    document.getElementById('edit-pai').value = m.pai || '';
    document.getElementById('edit-mae').value = m.mae || '';
    document.getElementById('edit-nascimento').value = m.nascimento || '';
    document.getElementById('edit-sexo').value = m.sexo || '';
    document.getElementById('edit-nacionalidade').value = m.nacionalidade || '';
    document.getElementById('edit-casamento').value = m.casamento || '';
    
    // Convert old string cargos or handle empty
    let cargosObjArray = m.cargos || [];
    if(cargosObjArray.length > 0 && typeof cargosObjArray[0] === 'string') {
        cargosObjArray = cargosObjArray.map(s => ({ cargo: s, departamento: '-' })); // fix legacy format
        m.cargos = cargosObjArray; 
    }
    
    const editListaCargos = document.getElementById('edit-lista-cargos');
    editListaCargos.innerHTML = '';
    if(cargosObjArray.length === 0) {
        adicionarCampoCargoEdit();
    } else {
        cargosObjArray.forEach(c => adicionarCampoCargoEdit(c.cargo, c.departamento, c.congregacao));
    }
    
    const boxEca = document.getElementById('box-eca');
    const ecaHeader = document.getElementById('eca-header-text');
    const ecaAlvo = document.getElementById('eca-departamento-alvo');
    
    // Populating values
    if(!m.eca) m.eca = { link: '', emissao: '', validade: '' };
    document.getElementById('eca-link').value = m.eca.link || '';
    // legacy support for 'data' moving to 'emissao'
    document.getElementById('eca-emissao').value = m.eca.emissao || (m.eca.data ? m.eca.data : '');
    document.getElementById('eca-validade').value = m.eca.validade || '';
    
    const ecaBtn = document.getElementById('eca-link-btn');
    if (m.eca.link && m.eca.link.trim() !== '') {
        ecaBtn.style.display = 'inline-flex';
        let href = m.eca.link.trim();
        if (!href.startsWith('http')) href = 'https://' + href;
        ecaBtn.href = href;
    } else {
        ecaBtn.style.display = 'none';
        ecaBtn.href = '#';
    }

    if (EcaRequired(m.cargos)) {
        boxEca.style.borderColor = '#ec4899';
        boxEca.style.backgroundColor = 'rgba(236, 72, 153, 0.05)';
        ecaHeader.style.color = '#be185d';
        ecaHeader.innerHTML = '<i class="ri-shield-user-fill"></i> Anexar Antecedente Criminal - Auditoria ECA';
        ecaAlvo.innerHTML = '<b style="color:#be185d;">Alerta:</b> Obrigatório para voluntários que trabalham com crianças e adolescentes.';
    } else {
        boxEca.style.borderColor = 'var(--border-glass)';
        boxEca.style.backgroundColor = 'rgba(0,0,0,0.02)';
        ecaHeader.style.color = 'var(--text-muted)';
        ecaHeader.innerHTML = '<i class="ri-shield-check-line"></i> Anexar Antecedente Criminal - Auditoria ECA';
        ecaAlvo.innerHTML = 'Obrigatório para voluntários que trabalham com crianças e adolescentes.';
    }

    modalEditar.style.display = 'block';
}

function processAutoSave() {
    const id = document.getElementById('edit-id').value;
    const m = membros.find(x => x.id === id);
    if (!m) return;

    m.nome = document.getElementById('edit-nome').value.toUpperCase();
    m.congregacao = document.getElementById('edit-congregacao').value;
    m.telefone = document.getElementById('edit-telefone').value;
    m.telefone2 = document.getElementById('edit-telefone2').value;
    m.estado_civil = document.getElementById('edit-estado-civil').value;
    m.data_jesus = document.getElementById('edit-data-jesus').value.toUpperCase();
    m.data_batismo = document.getElementById('edit-data-batismo').value || null;
    m.rg = document.getElementById('edit-rg').value.toUpperCase();
    m.cpf = document.getElementById('edit-cpf').value;
    m.contato_emergencia_nome = document.getElementById('edit-contato-emergencia-nome').value.toUpperCase();
    m.contato_emergencia_tel = document.getElementById('edit-contato-emergencia-tel').value;
    m.data_carteirinha = document.getElementById('edit-data-carteirinha').value || null;  // null para Postgres DATE
    m.obs_carteirinha = document.getElementById('edit-obs-carteirinha').value || null;
    
    m.pai = document.getElementById('edit-pai').value.toUpperCase();
    m.mae = document.getElementById('edit-mae').value.toUpperCase();
    m.nascimento = document.getElementById('edit-nascimento').value || null;  // null para Postgres DATE
    m.sexo = document.getElementById('edit-sexo').value;
    m.nacionalidade = document.getElementById('edit-nacionalidade').value.toUpperCase();
    m.casamento = document.getElementById('edit-casamento').value || null;    // null para Postgres DATE
    
    let newCargosList = [];
    document.querySelectorAll('.edit-cargo-row').forEach(row => {
         const f = row.querySelector('.edit-cargo-f').value.trim();
         const d = row.querySelector('.edit-cargo-d').value.trim();
         const c = row.querySelector('.edit-cargo-c').value;
         if (f || d || c) newCargosList.push({ cargo: f.toUpperCase(), departamento: d.toUpperCase(), congregacao: c });
    });
    m.cargos = newCargosList;
    m.tem_cargo = m.cargos.length > 0;
    
    m.eca = {
        link: document.getElementById('eca-link').value,
        emissao: document.getElementById('eca-emissao').value,
        validade: document.getElementById('eca-validade').value
    };
}

document.getElementById('eca-emissao').addEventListener('change', (e) => {
    const emissaoStr = e.target.value;
    if (emissaoStr) {
        // use UTC dates to prevent timezone shifting
        const date = new Date(emissaoStr + 'T12:00:00Z');
        date.setMonth(date.getMonth() + 6);
        const y = date.getUTCFullYear();
        const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
        const d = date.getUTCDate().toString().padStart(2, '0');
        document.getElementById('eca-validade').value = `${y}-${month}-${d}`;
        processAutoSave(); 
        pushHistory();
        renderCRM();
    } else {
        document.getElementById('eca-validade').value = '';
    }
});

function adicionarCampoCargoEdit(cargoVal = '', deptoVal = '', congVal = '') {
   const editListaCargos = document.getElementById('edit-lista-cargos');
   const div = document.createElement('div');
   div.className = 'input-row edit-cargo-row';
   div.style.marginBottom = '10px';
   div.style.gap = '8px';
   div.innerHTML = `
     <div class="input-group" style="flex: 1;">
        <input type="text" class="edit-cargo-f uppercase-field" placeholder="CARGO" style="margin-bottom:0;" value="${cargoVal}">
     </div>
     <div class="input-group" style="flex: 1;">
        <input type="text" class="edit-cargo-d uppercase-field" placeholder="DEPT" style="margin-bottom:0;" value="${deptoVal}" list="lista-departamentos">
     </div>
     <div class="input-group" style="flex: 1;">
        <select class="edit-cargo-c" style="margin-bottom:0; padding: 0.6rem;">
           <option value="">Onde exerce?</option>
           ${CONGREGRACOES.map(c => `<option value="${c}" ${c === congVal ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
     </div>
     <button type="button" class="btn-sm btn-delete-cargo-edit" style="color:var(--primary); background:transparent; border:none; cursor:pointer;" title="Remover"><i class="ri-delete-bin-line"></i></button>
   `;
   
   div.querySelectorAll('input').forEach(inp => inp.addEventListener('input', uppercaseListener));
   
   div.querySelector('.btn-delete-cargo-edit').addEventListener('click', () => {
       div.remove();
       processAutoSave();
       pushHistory();
       renderCRM();
   });
   
   editListaCargos.appendChild(div);
}

document.getElementById('btn-edit-add-cargo').addEventListener('click', () => {
    adicionarCampoCargoEdit();
    processAutoSave();
    pushHistory();
    renderCRM();
});

// Auto Save triggers
const editForm = document.getElementById('edit-form-membro');
editForm.addEventListener('change', () => {
   processAutoSave();
   pushHistory();
   renderCRM();
   const id = document.getElementById('edit-id').value;
   const m = membros.find(x => x.id === id);
   if (m) dbSalvarMembro(m); // background sync
});
editForm.addEventListener('keyup', () => {
   processAutoSave();
   salvarMembros();
});


// --- Modal Carteirinha ---
const modalCarteirinha = document.getElementById('modal-carteirinha');
const closeBtn = document.getElementById('close-carteirinha');
const btnPrint = document.getElementById('btn-print');

closeBtn.onclick = () => modalCarteirinha.style.display = 'none';
window.onclick = (e) => {
  if (e.target == modalCarteirinha) modalCarteirinha.style.display = 'none';
  if (e.target == modalEditar) modalEditar.style.display = 'none';
  if (e.target == modalLogin) modalLogin.style.display = 'none';
  if (e.target == document.getElementById('modal-evento')) document.getElementById('modal-evento').style.display = 'none';
}

function abrirCarteirinha(id) {
  const m = membros.find(x => x.id === id);
  if (!m) return;

  document.getElementById('c-nome').innerText = m.nome;
  
  let func = 'Membro';
  if(m.tem_cargo && m.cargos && m.cargos.length > 0) {
      if(typeof m.cargos[0] === 'string') {
         func = m.cargos.join(' / '); 
      } else {
         func = m.cargos.map(c => `${c.cargo}${c.congregacao ? ` (${c.congregacao})` : ''}`).join(' / ');
      }
  }
  document.getElementById('c-funcao').innerText = func;
  
  document.getElementById('c-congregacao').innerText = m.congregacao;
  
  document.getElementById('c-pai').innerText = m.pai || '-';
  document.getElementById('c-mae').innerText = m.mae || '-';
  
  document.getElementById('c-sexo').innerText = m.sexo === 'Masculino' ? 'M' : 'F';
  document.getElementById('c-estadocivil').innerText = m.estado_civil;
  document.getElementById('c-nacionalidade').innerText = m.nacionalidade.toUpperCase();
  
  document.getElementById('c-rg').innerText = m.rg || '-';
  document.getElementById('c-cpf').innerText = m.cpf || '-';

  modalCarteirinha.style.display = 'block';
}

// --- Painel de Eventos Logic ---
const modalEvento = document.getElementById('modal-evento');
const btnOpenAddEvento = document.getElementById('btn-open-add-evento');
const closeEvento = document.getElementById('close-evento');

btnOpenAddEvento.addEventListener('click', () => {
   if (!isAdminAuthed || !['admin', 'coordenador'].includes(userRole)) {
      modalLogin.style.display = 'block';
      document.getElementById('admin-email').value = '';
      document.getElementById('admin-pass').value = '';
      document.getElementById('admin-email').focus();
      modalLogin.setAttribute('data-target', 'evento');
      return;
   }
   abrirModalEvento();
});

closeEvento.addEventListener('click', () => modalEvento.style.display = 'none');
document.getElementById('btn-ev-cancel').addEventListener('click', () => modalEvento.style.display = 'none');

// --- Importar Eventos em Massa ---
const modalImport = document.getElementById('modal-import-eventos');
document.getElementById('btn-open-import-evento').addEventListener('click', () => {
   document.getElementById('import-json-input').value = '';
   document.getElementById('import-json-feedback').textContent = '';
   modalImport.style.display = 'flex';
});
document.getElementById('close-import-eventos').addEventListener('click', () => {
   modalImport.style.display = 'none';
});
modalImport.addEventListener('click', e => { if (e.target === modalImport) modalImport.style.display = 'none'; });

document.getElementById('btn-import-json-confirm').addEventListener('click', async () => {
   const feedback = document.getElementById('import-json-feedback');
   const raw = document.getElementById('import-json-input').value.trim();
   if (!raw) { feedback.innerHTML = '<span style="color:red">❌ Cole o JSON antes de importar.</span>'; return; }

   let parsed;
   try { parsed = JSON.parse(raw); } catch(e) {
      feedback.innerHTML = `<span style="color:red">❌ JSON inválido: ${e.message}</span>`;
      return;
   }
   if (!Array.isArray(parsed)) { feedback.innerHTML = '<span style="color:red">❌ O JSON deve ser um array [ ... ].</span>'; return; }

   // Função para extrair todas as datas expandidas de um evento
   function getDatasEvento(ev) {
      const datas = [];
      if (ev.regras.tipo === 'pontual') {
         datas.push(ev.regras.pontual_data);
      } else if (ev.regras.tipo === 'multiplos') {
         datas.push(...(ev.regras.multiplos_datas || []));
      } else if (ev.regras.tipo === 'repetitivo') {
         const inicio = new Date(ev.regras.repete_data_inicio);
         const fim = new Date(ev.regras.repete_data_fim);
         const diasSemana = ev.regras.repete_dias?.map(d => parseInt(d)) || [];
         let d = new Date(inicio);
         while (d <= fim) {
            if (diasSemana.includes(d.getDay())) {
               datas.push(d.toISOString().split('T')[0]);
            }
            d.setDate(d.getDate() + 1);
         }
      }
      return datas;
   }

   // Verificar conflitos
   let conflitos = [];
   for (const ev of parsed) {
      const novo = {
         nome: ev.nome || 'SEM NOME',
         alcance: ev.alcance || 'Congregação',
         congregacao: ev.congregacao || null,
         congregacao_sede: ev.congregacao_sede || null,
         regras: ev.regras || {}
      };
      const horaStr = novo.regras.pontual_hora || novo.regras.multiplos_hora || novo.regras.repete_hora || '';
      const novasDatas = getDatasEvento(novo);

      for (const data of novasDatas) {
         for (const existente of eventos) {
            const existenteDatas = getDatasEvento(existente);
            if (existenteDatas.includes(data) &&
                horaStr === (existente.regras.pontual_hora || existente.regras.multiplos_hora || existente.regras.repete_hora || '') &&
                novo.alcance === existente.alcance) {
               conflitos.push(`<b>${novo.nome}</b> em ${data} às ${horaStr} (mesmo alcance: "${novo.alcance}")`);
            }
         }
      }
   }

   if (conflitos.length > 0) {
      feedback.innerHTML = `
         <div style="background:rgba(239,68,68,0.1); border-left:3px solid #ef4444; padding:0.8rem; border-radius:4px; margin-bottom:0.8rem;">
            <b style="color:#dc2626">⚠️ Conflito detectado:</b><br>
            ${conflitos.join('<br>')}
            <br><br>
            <button id="btn-import-anyway" style="margin-top:0.5rem; padding:0.4rem 0.8rem; background:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:600;">
               Importar mesmo assim
            </button>
         </div>
      `;
      document.getElementById('btn-import-anyway').addEventListener('click', () => executarImportacao());
      return;
   }

   executarImportacao();

   async function executarImportacao() {
      feedback.innerHTML = '<span style="color:var(--primary)">⏳ Importando...</span>';
      let ok = 0, fail = 0;
      for (const ev of parsed) {
         const novo = sanitizarEvento({
            id: ev.id || crypto.randomUUID(),
            nome: ev.nome || 'SEM NOME',
            alcance: ev.alcance || 'Congregação',
            congregacao: ev.congregacao || null,
            congregacao_sede: ev.congregacao_sede || null,
            local: ev.local || '',
            cartaz: ev.cartaz || null,
            responsaveis: ev.responsaveis || [],
            regras: ev.regras || {},
            eca: ev.eca || [],
            historico: ev.historico || [{ acao: 'Criado', por: currentUser?.email || 'importação', em: new Date().toISOString() }]
         });
         const err = await dbSalvarEvento(novo);
         if (!err) ok++; else fail++;
      }

      // Recarrega eventos do Supabase para sincronizar
      try {
         const { data: dbEventos } = await supabase.from('eventos').select('*');
         if (dbEventos) {
            eventos = dbEventos;
            historyStack = [JSON.stringify(eventos)];
            salvarEventosLocal();
         }
      } catch(e) { console.warn('Não foi possível recarregar eventos:', e); }

      renderEventos();
      modalImport.style.display = 'none';
      feedback.innerHTML = `<span style="color:#10b981">✅ ${ok} evento(s) importado(s) com sucesso.</span>${fail ? ` <span style="color:red">${fail} falhou.</span>` : ''}`;
   }
});

// Form display logic
const evAlcance = document.getElementById('ev-alcance');
const evCongs = document.getElementById('ev-cong-container');
const evSede = document.getElementById('ev-sede-container');

function updateAlcanceUI(val) {
   if (val === 'Congregação') {
      evCongs.style.display = 'block';
      evSede.style.display = 'none';
      document.getElementById('ev-cong').setAttribute('required', 'true');
   } else {
      evCongs.style.display = 'none';
      evSede.style.display = 'block';
      document.getElementById('ev-cong').removeAttribute('required');
   }
}

evAlcance.addEventListener('change', (e) => updateAlcanceUI(e.target.value));

const evTipoData = document.getElementById('ev-tipo-data');
const contPontual = document.getElementById('ev-container-pontual');
const contMulti = document.getElementById('ev-container-multiplos');
const contRepete = document.getElementById('ev-container-repetitivo');

evTipoData.addEventListener('change', (e) => {
   contPontual.style.display = 'none';
   contMulti.style.display = 'none';
   contRepete.style.display = 'none';
   document.getElementById('ev-data-pontual').removeAttribute('required');
   document.getElementById('ev-data-fim-repeticao').removeAttribute('required');

   if(e.target.value === 'pontual') {
      contPontual.style.display = 'flex';
      document.getElementById('ev-data-pontual').setAttribute('required', 'true');
   } else if(e.target.value === 'multiplos') {
      contMulti.style.display = 'flex';
   } else if(e.target.value === 'repetitivo') {
      contRepete.style.display = 'flex';
      document.getElementById('ev-data-fim-repeticao').setAttribute('required', 'true');
   }
});

// Dias Multiplos
let diasMultiplos = [];
const btnAddDia = document.getElementById('btn-ev-add-dia');
const inpAddDia = document.getElementById('ev-add-dia');
const divListaDias = document.getElementById('ev-lista-dias');

function renderListaDias() {
   divListaDias.innerHTML = '';
   diasMultiplos.forEach((dia, i) => {
      const span = document.createElement('span');
      span.className = 'badge';
      span.style.background = 'var(--surface-color)';
      span.style.color = 'var(--text-main)';
      span.style.border = '1px solid var(--border-glass)';
      span.innerHTML = `${dia.split('-').reverse().join('/')} <i class="ri-close-line" style="cursor:pointer; color:var(--primary)" data-idx="${i}"></i>`;
      divListaDias.appendChild(span);
   });
   divListaDias.querySelectorAll('i').forEach(icon => {
      icon.addEventListener('click', (e) => {
         diasMultiplos.splice(e.target.getAttribute('data-idx'), 1);
         renderListaDias();
      });
   });
}
btnAddDia.addEventListener('click', () => {
   if(inpAddDia.value) {
      if(!diasMultiplos.includes(inpAddDia.value)) {
         diasMultiplos.push(inpAddDia.value);
         diasMultiplos.sort();
         renderListaDias();
      }
      inpAddDia.value = '';
   }
});

// Ev Lista Responsaveis
const evListaResp = document.getElementById('ev-lista-resp');
const btnAddResp = document.getElementById('btn-ev-add-resp');

function addRespRow(nomeVal = '', telVal = '', funcVal = '') {
   const div = document.createElement('div');
   div.className = 'input-row resp-row';
   div.style.marginBottom = '10px';
   div.style.gap = '8px';
   div.innerHTML = `
     <div class="input-group" style="flex: 1.5;">
        <input type="text" class="r-nome uppercase-field" placeholder="NOME DO RESP." style="margin-bottom:0;" value="${nomeVal}">
     </div>
     <div class="input-group" style="flex: 1;">
        <input type="text" class="r-tel" placeholder="(00) 00000-0000" style="margin-bottom:0;" value="${telVal}">
     </div>
     <div class="input-group" style="flex: 1;">
        <input type="text" class="r-func uppercase-field" placeholder="FUNÇÃO/CARGO" style="margin-bottom:0;" value="${funcVal}">
     </div>
     <button type="button" class="btn-sm btn-del-resp" style="color:var(--primary); background:transparent; border:none; cursor:pointer;" title="Remover"><i class="ri-delete-bin-line"></i></button>
   `;

   div.querySelectorAll('input.uppercase-field').forEach(inp => inp.addEventListener('input', uppercaseListener));
   applyMask(div.querySelector('.r-tel'), phoneMask);

   div.querySelector('.btn-del-resp').addEventListener('click', () => div.remove());
   evListaResp.appendChild(div);
}

btnAddResp.addEventListener('click', addRespRow);

// Image Resize Canvas & Upload
const evFile = document.getElementById('ev-file');
const evCanvas = document.getElementById('ev-canvas');
const evPreview = document.getElementById('ev-preview');
let cartazBase64 = '';

evFile.addEventListener('change', (e) => {
   const file = e.target.files[0];
   if(!file) return;
   const reader = new FileReader();
   reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
         const MAX_WIDTH = 800;
         const MAX_HEIGHT = 800;
         let width = img.width;
         let height = img.height;
         if (width > height) {
           if (width > MAX_WIDTH) {
             height *= MAX_WIDTH / width;
             width = MAX_WIDTH;
           }
         } else {
           if (height > MAX_HEIGHT) {
             width *= MAX_HEIGHT / height;
             height = MAX_HEIGHT;
           }
         }
         evCanvas.width = width;
         evCanvas.height = height;
         const ctx = evCanvas.getContext('2d');
         ctx.drawImage(img, 0, 0, width, height);
         cartazBase64 = evCanvas.toDataURL('image/webp', 0.85); // good compression
         evPreview.src = cartazBase64;
         evPreview.style.display = 'block';
      };
      img.src = event.target.result;
   };
   reader.readAsDataURL(file);
});

function abrirModalEvento(idEvento = null) {
   const isEdit = !!idEvento;
   const ev = isEdit ? eventos.find(e => e.id === idEvento) : null;

   document.getElementById('ev-id').value = isEdit ? idEvento : '';
   document.getElementById('ev-modal-title').textContent = isEdit ? 'Editar Evento' : 'Adicionar Novo Evento';
   document.getElementById('ev-autor-label').innerHTML = isEdit
      ? 'Editado por (Seu Nome) <span class="req">*</span>'
      : 'Adicionado por (Seu Nome) <span class="req">*</span>';
   document.getElementById('ev-submit-label').textContent = isEdit ? 'Salvar Alterações' : 'Salvar Evento';

   if (!isEdit) {
      document.getElementById('form-evento').reset();
      document.getElementById('ev-id').value = '';
      diasMultiplos = [];
      renderListaDias();
      evListaResp.innerHTML = '';
      cartazBase64 = '';
      evPreview.src = '';
      evPreview.style.display = 'none';
      addRespRow();
      updateAlcanceUI('Todo o Campo');
      contPontual.style.display = 'flex';
      contMulti.style.display = 'none';
      contRepete.style.display = 'none';
      document.getElementById('ev-data-pontual').setAttribute('required', 'true');
      document.getElementById('ev-data-fim-repeticao').removeAttribute('required');
      // hide history
      document.getElementById('ev-historico-box').style.display = 'none';
   } else {
      // Pre-fill fields
      document.getElementById('ev-nome').value = ev.nome || '';
      document.getElementById('ev-local').value = ev.local || '';
      document.getElementById('ev-autor').value = '';
      document.getElementById('ev-alcance').value = ev.alcance || 'Todo o Campo';
      document.getElementById('ev-cong').value = ev.congregacao || '';
      document.getElementById('ev-sede').value = ev.congregacao_sede || '';
      updateAlcanceUI(ev.alcance || 'Todo o Campo');

      // Dates
      const tipo = ev.regras.tipo || 'pontual';
      document.getElementById('ev-tipo-data').value = tipo;
      contPontual.style.display = tipo === 'pontual' ? 'flex' : 'none';
      contMulti.style.display = tipo === 'multiplos' ? 'flex' : 'none';
      contRepete.style.display = tipo === 'repetitivo' ? 'flex' : 'none';
      if (tipo === 'pontual') {
         document.getElementById('ev-data-pontual').value = ev.regras.pontual_data || '';
         document.getElementById('ev-hora-pontual').value = ev.regras.pontual_hora || '';
         document.getElementById('ev-data-pontual').setAttribute('required', 'true');
         document.getElementById('ev-data-fim-repeticao').removeAttribute('required');
      } else if (tipo === 'multiplos') {
         diasMultiplos = [...(ev.regras.multiplos_dias || [])];
         renderListaDias();
         document.getElementById('ev-hora-multiplos').value = ev.regras.multiplos_hora || '';
         document.getElementById('ev-data-pontual').removeAttribute('required');
         document.getElementById('ev-data-fim-repeticao').removeAttribute('required');
      } else if (tipo === 'repetitivo') {
         document.getElementById('ev-regra-repeticao').value = ev.regras.repete_regra || '1_seg';
         document.getElementById('ev-hora-repeticao').value = ev.regras.repete_hora || '';
         document.getElementById('ev-data-fim-repeticao').value = ev.regras.repete_fim || '';
         document.getElementById('ev-data-pontual').removeAttribute('required');
         document.getElementById('ev-data-fim-repeticao').setAttribute('required', 'true');
      }

      // Cartaz
      cartazBase64 = ev.cartaz || '';
      if (cartazBase64) {
         evPreview.src = cartazBase64;
         evPreview.style.display = 'block';
      } else {
         evPreview.src = '';
         evPreview.style.display = 'none';
      }

      // Responsáveis
      evListaResp.innerHTML = '';
      if (ev.responsaveis && ev.responsaveis.length > 0) {
         ev.responsaveis.forEach(r => {
            addRespRow(r.nome, r.telefone, r.funcao);
         });
      } else {
         addRespRow();
      }

      // Histórico
      const histBox = document.getElementById('ev-historico-box');
      const histLista = document.getElementById('ev-historico-lista');
      const hist = ev.historico || [];
      if (hist.length > 0) {
         histLista.innerHTML = hist.slice().reverse().map(h => {
            const dt = new Date(h.em);
            const fmt = `${dt.toLocaleDateString('pt-BR')} às ${dt.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}`;
            const icon = h.acao === 'Criado' ? 'ri-add-circle-line' : 'ri-edit-line';
            const cor = h.acao === 'Criado' ? 'var(--primary)' : 'var(--secondary)';
            return `<div style="display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:8px; background:rgba(0,0,0,0.03);">
               <i class="${icon}" style="color:${cor}; font-size:1rem;"></i>
               <span><b>${h.acao}</b> por <b>${h.por}</b></span>
               <span style="margin-left:auto; color:var(--text-muted); font-size:0.8rem;">${fmt}</span>
            </div>`;
         }).join('');
         histBox.style.display = 'block';
      } else {
         histBox.style.display = 'none';
      }
   }

   modalEvento.style.display = 'block';
}

const formEvento = document.getElementById('form-evento');
formEvento.addEventListener('submit', (e) => {
   e.preventDefault();

   const evId = document.getElementById('ev-id').value;
   const isEdit = !!evId;
   const autorNome = document.getElementById('ev-autor').value.trim().toUpperCase();
   const agora = new Date().toISOString();

   const finalCartazUrl = cartazBase64; // base64 stored directly in localStorage

   const regras = {
      tipo: document.getElementById('ev-tipo-data').value,
      pontual_data: document.getElementById('ev-data-pontual').value,
      pontual_hora: document.getElementById('ev-hora-pontual').value,
      multiplos_dias: diasMultiplos,
      multiplos_hora: document.getElementById('ev-hora-multiplos').value,
      repete_regra: document.getElementById('ev-regra-repeticao').value,
      repete_hora: document.getElementById('ev-hora-repeticao').value,
      repete_fim: document.getElementById('ev-data-fim-repeticao').value
   };

   const respList = [];
   document.querySelectorAll('.resp-row').forEach(row => {
      const n = row.querySelector('.r-nome').value.trim();
      const t = row.querySelector('.r-tel').value.trim();
      const f = row.querySelector('.r-func').value.trim();
      if (n || t || f) respList.push({ nome: n, telefone: t, funcao: f });
   });

   const alcanceVal = document.getElementById('ev-alcance').value;
   const congregacaoVal = alcanceVal === 'Congregação' ? (document.getElementById('ev-cong').value || '') : '';
   const congregacaoSedeVal = alcanceVal === 'Todo o Campo' ? (document.getElementById('ev-sede').value || '') : '';

   let evObj = null;

   if (isEdit) {
      const idx = eventos.findIndex(ev => ev.id === evId);
      if (idx !== -1) {
         const histEntry = { acao: 'Editado', por: autorNome || 'ADMIN', em: agora };
         evObj = {
            ...eventos[idx],
            nome: document.getElementById('ev-nome').value.trim().toUpperCase(),
            local: document.getElementById('ev-local').value.trim().toUpperCase(),
            alcance: alcanceVal,
            congregacao: congregacaoVal,
            congregacao_sede: congregacaoSedeVal,
            regras,
            cartaz: finalCartazUrl,
            responsaveis: respList,
            historico: [...(eventos[idx].historico || []), histEntry]
         };
         eventos[idx] = evObj;
      }
   } else {
      const histEntry = { acao: 'Criado', por: autorNome || 'ADMIN', em: agora };
      evObj = {
         id: Date.now().toString(),
         nome: document.getElementById('ev-nome').value.trim().toUpperCase(),
         local: document.getElementById('ev-local').value.trim().toUpperCase(),
         alcance: alcanceVal,
         congregacao: congregacaoVal,
         congregacao_sede: congregacaoSedeVal,
         regras,
         cartaz: finalCartazUrl,
         responsaveis: respList,
         historico: [histEntry],
         data_criacao: agora
      };
      eventos.push(evObj);
   }

   if (evObj) {
      salvarEventos();
      dbSalvarEvento(evObj); // background sync
   }

   modalEvento.style.display = 'none';
   renderEventos();
});

function expandirEventos() {
    const timeline = [];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const limitDate = new Date();
    limitDate.setFullYear(hoje.getFullYear() + 1); // Expand for 1 year ahead max

    eventos.forEach(ev => {
        if (!ev.regras) return;
        if (ev.regras.tipo === 'pontual') {
            if (ev.regras.pontual_data) {
                timeline.push({ ...ev, data_sort: new Date(ev.regras.pontual_data + 'T12:00:00Z'), instance_date: ev.regras.pontual_data });
            }
        } else if (ev.regras.tipo === 'multiplos') {
            if (ev.regras.multiplos_dias) {
                ev.regras.multiplos_dias.forEach(dia => {
                    timeline.push({ ...ev, data_sort: new Date(dia + 'T12:00:00Z'), instance_date: dia });
                });
            }
        } else if (ev.regras.tipo === 'repetitivo') {
            if (ev.regras.repete_regra && ev.regras.repete_fim) {
                const parts = ev.regras.repete_regra.split('_');
                if (parts.length < 2) return;
                const nth = parseInt(parts[0]);
                const dayOfWeekStr = parts[1];
                const dayMap = { 'seg': 1, 'ter': 2, 'qua': 3, 'qui': 4, 'sex': 5, 'sab': 6, 'dom': 0 };
                const dayOfWeek = dayMap[dayOfWeekStr];

                const start = new Date(ev.data_criacao || Date.now());
                const end = new Date(ev.regras.repete_fim + 'T23:59:59Z');

                let current = new Date(start.getFullYear(), start.getMonth(), 1);
                while (current <= end && current <= limitDate) {
                    const occurrence = getNthDayOfMonth(current.getFullYear(), current.getMonth(), nth, dayOfWeek);
                    if (occurrence && occurrence >= start && occurrence <= end) {
                        const occStr = occurrence.toISOString().split('T')[0];
                        timeline.push({ 
                            ...ev, 
                            data_sort: occurrence, 
                            instance_date: occStr,
                            is_recurrence: true 
                        });
                    }
                    current.setMonth(current.getMonth() + 1);
                }
            }
        }
    });

    return timeline;
}

function updateEvMonthLabel() {
    const label = document.getElementById('ev-mes-label');
    if (label) label.textContent = `${MESES_NOME[evCurrentMonth]} de ${evCurrentYear}`;
}

function renderEventos() {
    try {
        updateEvMonthLabel();
        const filterEl = document.getElementById('filter-eventos-cong');
        if (!filterEl) return;
        const filterEv = filterEl.value;
        const grid = document.getElementById('eventos-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        let expanded = expandirEventos();

        // Filter by selected month/year and congregation
        let evsFiltrados = expanded.filter(ev => {
            const d = ev.data_sort;
            if (d.getFullYear() !== evCurrentYear || d.getMonth() !== evCurrentMonth) return false;
            if (filterEv === 'Todos') return true;
            // Congregation-specific event
            if (ev.alcance === 'Congregação' && ev.congregacao === filterEv) return true;
            // General event that takes place in the selected congregation
            if (ev.alcance === 'Todo o Campo' && ev.congregacao_sede === filterEv) return true;
            return false;
        });

        evsFiltrados.sort((a, b) => a.data_sort - b.data_sort);

        if (evsFiltrados.length === 0) {
            grid.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:4rem 2rem;">
                    <i class="ri-calendar-check-line" style="font-size:3.5rem; color:var(--text-muted); opacity:0.35; display:block; margin-bottom:1rem;"></i>
                    <p style="color:var(--text-muted); font-size:1.05rem;">Nenhum evento para ${MESES_NOME[evCurrentMonth]} de ${evCurrentYear}.</p>
                </div>`;
            return;
        }

        evsFiltrados.forEach(ev => {
            const isEnded = ev.data_sort < hoje;
            const card = document.createElement('div');
            card.className = `ev-card${isEnded ? ' ev-card-ended' : ''}`;

            const dataFormatada = ev.instance_date.split('-').reverse().join('/');
            const diasSemana = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
            const [ano, mes, dia] = ev.instance_date.split('-').map(Number);
            const diaSemana = diasSemana[new Date(ano, mes - 1, dia).getDay()];
            let horaDisp = '';
            if (ev.regras.tipo === 'pontual') horaDisp = ev.regras.pontual_hora;
            else if (ev.regras.tipo === 'multiplos') horaDisp = ev.regras.multiplos_hora;
            else if (ev.regras.tipo === 'repetitivo') horaDisp = ev.regras.repete_hora;
            const horaStr = horaDisp ? ` às ${horaDisp}` : '';

            // Badge: for general events show congregation where it takes place (if any)
            const badgeColor = ev.alcance === 'Todo o Campo' ? 'var(--primary)' : 'var(--secondary)';
            let badgeLabel = ev.alcance === 'Todo o Campo'
                ? (ev.congregacao_sede ? `Geral · ${ev.congregacao_sede}` : 'Geral')
                : ev.congregacao;

            let respHtml = '';
            if (ev.responsaveis && ev.responsaveis.length > 0) {
                ev.responsaveis.forEach(r => {
                    let num = r.telefone.replace(/\D/g, '');
                    let msg = encodeURIComponent(`Olá ${r.nome}! Gostaria de informações sobre o evento "${ev.nome}".`);
                    respHtml += `
                        <div class="ev-resp-item">
                            <div class="ev-resp-info">
                                <strong>${r.nome}</strong>
                                <small>${r.funcao}</small>
                            </div>
                            <a href="https://wa.me/55${num}?text=${msg}" target="_blank" class="btn-whatsapp" title="WhatsApp">
                                <i class="ri-whatsapp-line"></i>
                            </a>
                        </div>`;
                });
            }

            card.innerHTML = `
                <div class="ev-img-box">
                    ${ev.cartaz
                        ? `<img src="${ev.cartaz}" alt="${ev.nome}">`
                        : `<div class="ev-no-poster"><i class="ri-image-line"></i><span>Sem cartaz</span></div>`}
                    ${isEnded ? '<div class="ev-ended-overlay">ENCERRADO</div>' : ''}
                    <div class="ev-badge-local" style="background:${badgeColor};">${badgeLabel}</div>
                </div>
                <div class="ev-info">
                    <h3>${ev.nome}</h3>
                    <div class="ev-detail"><i class="ri-calendar-line"></i><span><b>${dataFormatada}</b>${horaStr} <span style="color:var(--text-muted); font-size:0.85em;">(${diaSemana})</span></span></div>
                    ${ev.local ? `<div class="ev-detail"><i class="ri-map-pin-line"></i><span>${ev.local}</span></div>` : ''}
                    ${respHtml ? `
                    <div class="ev-resps-container">
                        <div class="ev-resp-label"><i class="ri-team-line"></i> Responsáveis</div>
                        <div class="ev-resp-list">${respHtml}</div>
                    </div>` : ''}
                    
                    <div class="ev-card-actions" style="margin-top: 10px; border-top: 1px solid var(--border-glass); padding-top: 10px; justify-content: space-between;">
                        ${ev.cartaz ? `
                        <button class="btn-sm btn-download-evt" data-url="${ev.cartaz}" data-name="${ev.nome}" title="Baixar Cartaz" style="color:var(--primary); background:transparent; border:none; cursor:pointer; display:flex; align-items:center; gap:4px;">
                            <i class="ri-download-2-line"></i> Baixar Cartaz
                        </button>` : '<span></span>'}

                        ${isAdminAuthed ? `
                        <div style="display: flex; gap: 8px;">
                          <button class="btn-sm btn-edit-evt" data-id="${ev.id}" title="Editar" style="color:var(--secondary); background:transparent; border:none; cursor:pointer; display:flex; align-items:center; gap:4px;">
                              <i class="ri-edit-line"></i>
                          </button>
                          <button class="btn-sm btn-del-evt" data-id="${ev.id}" title="Excluir" style="color:var(--primary); background:transparent; border:none; cursor:pointer; display:flex; align-items:center; gap:4px;">
                              <i class="ri-delete-bin-line"></i>
                          </button>
                        </div>` : ''}
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });

        // --- Download Listener ---
        grid.querySelectorAll('.btn-download-evt').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const url = e.currentTarget.getAttribute('data-url');
                const name = e.currentTarget.getAttribute('data-name');
                try {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    const blobUrl = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = `cartaz-${name.toLowerCase().replace(/\s+/g, '-')}.webp`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(blobUrl);
                } catch (err) {
                    console.error("Erro ao baixar cartaz:", err);
                    alert("Erro ao baixar a imagem. Clique com o botão direito e selecione 'Guardar imagem como'.");
                }
            });
        });

        grid.querySelectorAll('.btn-edit-evt').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                abrirModalEvento(e.currentTarget.getAttribute('data-id'));
            });
        });

        grid.querySelectorAll('.btn-del-evt').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.currentTarget.getAttribute('data-id');
                if (confirm('Excluir este evento? Todas as ocorrências serão removidas.')) {
                    eventos = eventos.filter(ev => ev.id !== id);
                    salvarEventos();
                    dbExcluirEvento(id); // background sync
                    renderEventos();
                }
            });
        });
    } catch (err) {
        console.error("Erro ao renderizar eventos:", err);
        const grid = document.getElementById('eventos-grid');
        if (grid) grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:4rem 2rem;">
                <i class="ri-error-warning-line" style="font-size:3.5rem; color:var(--primary); opacity:0.35; display:block; margin-bottom:1rem;"></i>
                <p style="color:var(--text-muted); font-size:1.05rem;">Houve um erro ao carregar os eventos.</p>
                <small style="color:var(--primary); cursor:pointer; text-decoration:underline;" onclick="location.reload()">Clique aqui para recarregar</small>
            </div>`;
    }
}

// --- VISTAS DE EVENTOS ---
let vistaAtual = 'lista';

document.querySelectorAll('.vista-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        vistaAtual = btn.getAttribute('data-vista');
        document.querySelectorAll('.vista-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.vista-container').forEach(c => c.style.display = 'none');
        document.getElementById(`vista-${vistaAtual}-container`).style.display = 'block';

        if (vistaAtual === 'calendario') renderCalendario();
        else if (vistaAtual === 'cards') renderCardsLayout();
    });
});

function renderCalendario() {
    const filterEl = document.getElementById('filter-eventos-cong');
    const filterEv = filterEl?.value || 'Todos';
    const container = document.getElementById('eventos-calendario');
    container.innerHTML = '';

    let expanded = expandirEventos();
    let evsFiltrados = expanded.filter(ev => {
        const d = ev.data_sort;
        if (d.getFullYear() !== evCurrentYear || d.getMonth() !== evCurrentMonth) return false;
        if (filterEv === 'Todos') return true;
        return ev.alcance === 'Todo o Campo' || ev.congregacao === filterEv || ev.congregacao_sede === filterEv;
    });

    // Agrupar por dia
    const porDia = {};
    for (let d = 1; d <= 31; d++) porDia[d] = [];
    evsFiltrados.forEach(ev => {
        const dia = ev.data_sort.getDate();
        porDia[dia].push(ev);
    });

    // Renderizar dias 1-31
    for (let dia = 1; dia <= 31; dia++) {
        const divDia = document.createElement('div');
        divDia.className = 'cal-dia';
        const eventos = porDia[dia];

        if (eventos.length === 0) {
            divDia.innerHTML = `
                <div class="cal-dia-num">${dia}</div>
                <div class="cal-dia-vazio">·</div>
            `;
        } else {
            let html = `<div class="cal-dia-num">${dia}</div><div class="cal-dia-eventos">`;
            eventos.slice(0, 3).forEach(ev => {
                const classe = ev.alcance === 'Todo o Campo' ? 'geral' : '';
                html += `<div class="cal-ev-badge ${classe}" title="${ev.nome}">${ev.nome.substring(0, 10)}...</div>`;
            });
            if (eventos.length > 3) html += `<div style="font-size:0.65rem; color:var(--text-muted);">+${eventos.length - 3}</div>`;
            html += '</div>';
            divDia.innerHTML = html;
        }

        divDia.addEventListener('click', () => {
            const data = new Date(evCurrentYear, evCurrentMonth, dia);
            const evDodia = expanded.filter(e => {
                const d = e.data_sort;
                return d.getDate() === dia && d.getMonth() === evCurrentMonth && d.getFullYear() === evCurrentYear;
            });
            if (evDodia.length > 0) {
                vistaAtual = 'lista';
                document.querySelectorAll('.vista-tab').forEach(b => b.classList.remove('active'));
                document.getElementById('vista-tab-lista').classList.add('active');
                document.querySelectorAll('.vista-container').forEach(c => c.style.display = 'none');
                document.getElementById('vista-lista-container').style.display = 'block';
                renderEventos();
            }
        });
        container.appendChild(divDia);
    }
}

function renderCardsLayout() {
    const filterEl = document.getElementById('filter-eventos-cong');
    const filterEv = filterEl?.value || 'Todos';
    const container = document.getElementById('eventos-cards-layout');
    container.innerHTML = '';

    let expanded = expandirEventos();
    let evsFiltrados = expanded.filter(ev => {
        const d = ev.data_sort;
        if (d.getFullYear() !== evCurrentYear || d.getMonth() !== evCurrentMonth) return false;
        if (filterEv === 'Todos') return true;
        return ev.alcance === 'Todo o Campo' || ev.congregacao === filterEv || ev.congregacao_sede === filterEv;
    });

    evsFiltrados.sort((a, b) => a.data_sort - b.data_sort);

    evsFiltrados.forEach(ev => {
        const dataFmt = ev.data_sort.toLocaleDateString('pt-BR');
        const horaFmt = ev.hora_display || '—';
        const localFmt = ev.local || (ev.congregacao_sede || ev.congregacao || '');

        const card = document.createElement('div');
        card.className = 'card-evento-horizontal';
        card.innerHTML = `
            <div class="card-ev-info">
                <div>
                    <div class="card-ev-nome">${ev.nome}</div>
                    <div class="card-ev-details">
                        <div class="card-ev-detail-row">
                            <i class="ri-calendar-line"></i>
                            <span>${dataFmt}</span>
                        </div>
                        <div class="card-ev-detail-row">
                            <i class="ri-time-line"></i>
                            <span>${horaFmt}</span>
                        </div>
                        <div class="card-ev-detail-row">
                            <i class="ri-map-pin-line"></i>
                            <span>${localFmt}</span>
                        </div>
                    </div>
                </div>
                <div class="card-ev-badges">
                    <span class="card-ev-badge ${ev.alcance === 'Todo o Campo' ? 'geral' : ''}">
                        ${ev.alcance === 'Todo o Campo' ? 'Geral' : ev.congregacao || ev.congregacao_sede}
                    </span>
                </div>
            </div>
            <div class="card-ev-imagem">
                ${ev.cartaz
                    ? `<img src="${ev.cartaz}" alt="${ev.nome}">`
                    : `<div class="card-ev-no-img"><i class="ri-image-line"></i><span>Sem cartaz</span></div>`}
            </div>
        `;
        container.appendChild(card);
    });

    if (evsFiltrados.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:4rem 2rem; color:var(--text-muted);">
                <i class="ri-calendar-clear-line" style="font-size:3rem; display:block; margin-bottom:1rem; opacity:0.5;"></i>
                <p>Nenhum evento neste período</p>
            </div>
        `;
    }
}

function renderAniversariantes() {
    const mes = parseInt(document.getElementById('aniv-mes-sel').value);
    const mesNum = (mes + 1).toString().padStart(2, '0');
    const cong = document.getElementById('aniv-cong-sel').value;
    const grid = document.getElementById('aniversariantes-grid');
    grid.innerHTML = '';

    let found = membros.filter(m => {
        const matchCong = cong === 'Todos' || m.congregacao === cong;
        if (!matchCong) return false;
        const nascMes = m.nascimento ? m.nascimento.split('-')[1] : null;
        const casMes = m.casamento ? m.casamento.split('-')[1] : null;
        return nascMes === mesNum || casMes === mesNum;
    });

    // Sort by day of birth
    found.sort((a, b) => {
        const diaA = a.nascimento ? parseInt(a.nascimento.split('-')[2]) : 99;
        const diaB = b.nascimento ? parseInt(b.nascimento.split('-')[2]) : 99;
        return diaA - diaB;
    });

    if (found.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:4rem 2rem;">
                <i class="ri-cake-2-line" style="font-size:3.5rem; color:var(--text-muted); opacity:0.35; display:block; margin-bottom:1rem;"></i>
                <p style="color:var(--text-muted); font-size:1.05rem;">Nenhum aniversariante em ${MESES_NOME[mes]}.</p>
            </div>`;
        return;
    }

    const hoje = new Date();
    const hojeMes = (hoje.getMonth() + 1).toString().padStart(2, '0');
    const hojeDia = hoje.getDate().toString().padStart(2, '0');

    found.forEach(m => {
        const nascParts = m.nascimento ? m.nascimento.split('-') : null;
        const nascMes = nascParts ? nascParts[1] : null;
        const nascDia = nascParts ? nascParts[2] : null;
        const casParts = m.casamento ? m.casamento.split('-') : null;
        const casMes = casParts ? casParts[1] : null;
        const casDia = casParts ? casParts[2] : null;

        const isNasc = nascMes === mesNum;
        const isCas = casMes === mesNum;

        const isHoje = (isNasc && nascMes === hojeMes && nascDia === hojeDia)
                    || (isCas && casMes === hojeMes && casDia === hojeDia);

        const card = document.createElement('div');
        card.className = `aniv-card${isHoje ? ' aniv-hoje' : ''}`;

        let tipoHtml = '';
        if (isNasc && nascParts) {
            const idade = hoje.getFullYear() - parseInt(nascParts[0]);
            tipoHtml += `<span class="aniv-tipo aniv-nasc"><i class="ri-cake-2-line"></i> Nascimento — ${nascDia}/${mesNum} <b>(${idade} anos)</b></span>`;
        }
        if (isCas && casParts) {
            const anos = hoje.getFullYear() - parseInt(casParts[0]);
            tipoHtml += `<span class="aniv-tipo aniv-cas"><i class="ri-heart-pulse-fill"></i> Casamento — ${casDia}/${mesNum} <b>(${anos} anos)</b></span>`;
        }

        let cargosStr = 'Membro';
        if (m.tem_cargo && m.cargos && m.cargos.length > 0) {
            cargosStr = m.cargos.map(c => c.cargo).join(', ');
        }

        card.innerHTML = `
            ${isHoje ? '<div class="aniv-hoje-badge"><i class="ri-star-fill"></i> HOJE!</div>' : ''}
            <div class="aniv-avatar">
                <i class="${m.sexo === 'Feminino' ? 'ri-user-smile-line' : 'ri-user-line'}"></i>
            </div>
            <div class="aniv-info">
                <h4>${m.nome}</h4>
                <span class="badge">${m.congregacao}</span>
                <p class="aniv-funcao">${cargosStr}</p>
                <div class="aniv-tipos">${tipoHtml}</div>
            </div>
            ${m.telefone ? `
            <a href="https://wa.me/55${m.telefone.replace(/\D/g,'')}" target="_blank" class="btn-whatsapp aniv-wa" title="Enviar parabéns via WhatsApp">
                <i class="ri-whatsapp-line"></i>
            </a>` : ''}
        `;
        grid.appendChild(card);
    });
}

// --- Eventos view tab & navigation listeners ---
document.getElementById('ev-tab-eventos').addEventListener('click', () => {
    document.getElementById('ev-tab-eventos').classList.add('active');
    document.getElementById('ev-tab-aniversariantes').classList.remove('active');
    document.getElementById('ev-content-eventos').style.display = 'block';
    document.getElementById('ev-content-aniversariantes').style.display = 'none';
    renderEventos();
});

document.getElementById('ev-tab-aniversariantes').addEventListener('click', () => {
    document.getElementById('ev-tab-aniversariantes').classList.add('active');
    document.getElementById('ev-tab-eventos').classList.remove('active');
    document.getElementById('ev-content-aniversariantes').style.display = 'block';
    document.getElementById('ev-content-eventos').style.display = 'none';
    // Default to current month
    document.getElementById('aniv-mes-sel').value = new Date().getMonth();
    renderAniversariantes();
});

function atualizarMesVista() {
    if (vistaAtual === 'lista') renderEventos();
    else if (vistaAtual === 'calendario') renderCalendario();
    else if (vistaAtual === 'cards') renderCardsLayout();
}

document.getElementById('ev-prev-mes').addEventListener('click', () => {
    evCurrentMonth--;
    if (evCurrentMonth < 0) { evCurrentMonth = 11; evCurrentYear--; }
    atualizarMesVista();
});

document.getElementById('ev-next-mes').addEventListener('click', () => {
    evCurrentMonth++;
    if (evCurrentMonth > 11) { evCurrentMonth = 0; evCurrentYear++; }
    atualizarMesVista();
});

document.getElementById('filter-eventos-cong').addEventListener('change', () => {
    if (vistaAtual === 'lista') renderEventos();
    else if (vistaAtual === 'calendario') renderCalendario();
    else if (vistaAtual === 'cards') renderCardsLayout();
});
document.getElementById('aniv-mes-sel').addEventListener('change', renderAniversariantes);
document.getElementById('aniv-cong-sel').addEventListener('change', renderAniversariantes);

// Print Injection
const printStyle = document.createElement('style');
printStyle.innerHTML = `
  @media print {
    body * { visibility: hidden; }
    #carteirinha-print, #carteirinha-print * { visibility: visible; }
    #carteirinha-print { position: absolute; left: 0; top: 0; transform: scale(1.1); transform-origin: top left; height: 100%; }
    .modal { background: white !important; }
  }
`;
document.head.appendChild(printStyle);
btnPrint.addEventListener('click', () => window.print());

// --- Boot ---
async function initApp() {
    // Splash screen
    const splash = document.createElement('div');
    splash.id = 'splash-screen';
    splash.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:var(--bg-main);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;';
    splash.innerHTML = `
        <i class="ri-fire-fill" style="font-size:4rem;color:var(--primary);filter:drop-shadow(0 0 16px rgba(234,88,12,0.5));"></i>
        <p style="color:var(--text-main);font-weight:700;font-size:1.1rem;">AD Sauípe</p>
        <p id="splash-msg" style="color:var(--text-muted);font-size:0.9rem;">Carregando dados...</p>
        <div style="width:180px;height:3px;background:rgba(0,0,0,0.08);border-radius:2px;overflow:hidden;margin-top:6px;">
            <div style="width:40%;height:100%;background:var(--primary);border-radius:2px;animation:splashBar 1.2s infinite ease-in-out;"></div>
        </div>
        <style>@keyframes splashBar{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}</style>
    `;
    document.body.appendChild(splash);

    const setSplashMsg = (msg) => {
        const el = document.getElementById('splash-msg');
        if (el) el.textContent = msg;
    };

    try {
        setSplashMsg('Testando conex\u00e3o com Supabase...');
        const { data: dbMembros, error: errM } = await withTimeout(
            supabase.from('membros').select('*'),
            8000,
            'Consulta de membros'
        );
        if (errM) throw errM;
        console.log('%c[Supabase] \u2705 Conex\u00e3o bem-sucedida!', 'color: #22c55e; font-weight: bold;', `${(dbMembros||[]).length} membro(s) carregado(s).`);

        setSplashMsg('Buscando eventos...');
        const { data: dbEventos, error: errE } = await withTimeout(
            supabase.from('eventos').select('*'),
            8000,
            'Consulta de eventos'
        );
        if (errE) throw errE;

        membros = dbMembros || [];
        eventos = dbEventos || [];

        // Migra dados do localStorage para o Supabase (primeira vez)
        const localMembros = JSON.parse(localStorage.getItem('ad_sauipe_membros') || '[]');
        const localEventos = JSON.parse(localStorage.getItem('ad_sauipe_eventos') || '[]');

        if (membros.length === 0 && localMembros.length > 0) {
            setSplashMsg('Migrando membros locais...');
            for (const m of localMembros) await dbSalvarMembro(m);
            const { data } = await withTimeout(
                supabase.from('membros').select('*'),
                8000,
                'Recarga de membros'
            );
            membros = data || localMembros;
        }

        if (eventos.length === 0 && localEventos.length > 0) {
            setSplashMsg('Migrando eventos locais...');
            for (const ev of localEventos) await dbSalvarEvento(ev);
            const { data } = await withTimeout(
                supabase.from('eventos').select('*'),
                8000,
                'Recarga de eventos'
            );
            eventos = data || localEventos;
        }

        // Atualiza cache local
        salvarMembrosLocal();
        salvarEventosLocal();

    } catch (err) {
        console.warn('Supabase indisponível, usando cache local:', err.message);
        // Fallback: usa o que tiver no localStorage
        membros = JSON.parse(localStorage.getItem('ad_sauipe_membros') || '[]');
        eventos = JSON.parse(localStorage.getItem('ad_sauipe_eventos') || '[]');
        setSplashMsg('Usando dados locais (offline)');
        await new Promise(r => setTimeout(r, 800));
    }

    // Migração de formato antigo de cargos
    membros.forEach(m => {
        if (m.cargos && m.cargos.length > 0 && typeof m.cargos[0] === 'string') {
            m.cargos = m.cargos.map(s => ({ cargo: s, departamento: '-' }));
        }
    });

    // Atualiza historyStack com dados reais
    historyStack = [JSON.stringify(membros)];
    historyIndex = 0;

    // DataList de departamentos
    if (!document.getElementById('lista-departamentos')) {
        const dl = document.createElement('datalist');
        dl.id = 'lista-departamentos';
        dl.innerHTML = DEPARTAMENTOS.map(d => `<option value="${d}">`).join('');
        document.body.appendChild(dl);
    }

    document.body.removeChild(splash);
    updateUIByRole();  // Atualizar UI baseado em permissões
    renderCRM();
}

initApp();
