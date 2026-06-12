import {
  calcularRanking, calcularPremios, pontosJogo, chaveJogo, canonArtilheiro,
} from './engine.js';

// Quem sou "eu" (destaque pessoal). PADRÃO = anônimo (EU vazio) → nada é identificado.
// A versão pessoal é opt-in explícito via window.__EU__ (ver scripts/build_single_file.py).
const EU = (typeof window !== 'undefined' && window.__EU__ !== undefined) ? window.__EU__ : '';
const MODO_GRUPO = (typeof window !== 'undefined' && window.__MODO_GRUPO__ !== undefined)
  ? !!window.__MODO_GRUPO__ : (EU === '');
const MESES = { '01': 'jan', '02': 'fev', '03': 'mar', '04': 'abr', '05': 'mai', '06': 'jun', '07': 'jul' };

const estado = {
  palpites: [], resultados: { grupos: {}, master: {}, config: { pagantes: 42 } },
  matamata: null, ranking: [], pagantes: 42, abaAtiva: 'hoje',
  filtroGrupo: '', filtroParticipante: '',
};

// ---------- utilidades ----------
const $ = (sel, el = document) => el.querySelector(sel);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function hojeBR() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function dataOrd(dStr) { const [dd, mm] = dStr.split('/'); return Number(mm) * 100 + Number(dd); }
function dataLonga(dStr) { const [dd, mm] = dStr.split('/'); return `${dd} ${MESES[mm] || mm}`; }
const brl = (n) => 'R$ ' + n.toLocaleString('pt-BR');

function realDoJogo(g) {
  const r = estado.resultados.grupos[chaveJogo(g)];
  return r && r.gc != null && r.gf != null ? r : null;
}

function horarioDoJogo(g) {
  const r = estado.resultados.grupos[chaveJogo(g)];
  return r && r.horario ? r.horario : null;
}

// Junta a lista de jogos (1×) com os palpites compactos de cada participante.
function rehidratar(jogos, compactos) {
  return compactos.map((c) => ({
    nome: c.nome, campeao: c.campeao, artilheiro: c.artilheiro,
    palpites: jogos.map((g, i) => ({ data: g.data, grupo: g.grupo, casa: g.casa, fora: g.fora, palpite: c.p[i] })),
  }));
}

// ---------- carregamento ----------
async function carregar() {
  try {
    let jogos, comp, r, mm;
    if (window.__BOLAO_DADOS__) {
      // versão single-file (offline, compartilhável): dados embutidos no HTML
      ({ jogos, palpites: comp, resultados: r, matamata: mm } = window.__BOLAO_DADOS__);
    } else {
      // jogos/palpites NÃO mudam → deixa o navegador cachear (sem cache-buster).
      // Só resultados.json é rebaixado fresco (muda durante a Copa).
      [jogos, comp, r, mm] = await Promise.all([
        fetch('data/jogos.json').then((x) => x.json()),
        fetch('data/palpites.json').then((x) => x.json()),
        fetch('data/resultados.json?_=' + Date.now()).then((x) => x.json()),
        fetch('data/palpites_matamata.json').then((x) => x.json()).catch(() => null),
      ]);
    }
    estado.palpites = rehidratar(jogos, comp);
    estado.resultados = r;
    estado.matamata = mm;
    estado.pagantes = (r.config && r.config.pagantes) || 42;
    recalcular();
    montarAtualizadoEm();
    render();
  } catch (e) {
    $('#conteudo').innerHTML = `<div class="erro">Erro ao carregar os dados: ${esc(e.message)}.<br>Confirme que os arquivos em <code>data/</code> existem.</div>`;
    console.error(e);
  }
}

function recalcular() {
  estado.ranking = calcularRanking(estado.palpites, estado.resultados, estado.matamata);
}

function montarAtualizadoEm() {
  const t = estado.resultados.atualizado_em;
  $('#atualizado').textContent = t ? `atualizado: ${t}` : 'aguardando 1º resultado';
}

// ---------- navegação ----------
function initAbas() {
  document.querySelectorAll('.aba').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.aba').forEach((x) => x.classList.remove('ativa'));
      b.classList.add('ativa');
      estado.abaAtiva = b.dataset.tab;
      render();
      window.scrollTo({ top: 0 });
    });
  });
}

function render() {
  const c = $('#conteudo');
  c.innerHTML = '';
  ({ hoje: telaHoje, ranking: telaRanking, jogos: telaJogos, cola: telaCola, master: telaMaster }[estado.abaAtiva])(c);
}

// ---------- TELA 0: HOJE (panorama do dia) ----------
// Estatística do grupo para um jogo: distribuição de palpites + acertos (se já jogado).
function statsJogo(g) {
  const real = realDoJogo(g);
  let casa = 0, empate = 0, fora = 0, exatos = 0, parciais = 0;
  const placares = {};
  let meu = null;
  for (const p of estado.palpites) {
    const pal = p.palpites.find((x) => x.casa === g.casa && x.fora === g.fora && x.data === g.data);
    if (!pal) continue;
    const [a, b] = pal.palpite;
    if (a > b) casa++; else if (a < b) fora++; else empate++;
    const k = `${a}x${b}`;
    placares[k] = (placares[k] || 0) + 1;
    if (real) {
      const r = pontosJogo(pal.palpite, [real.gc, real.gf], 'grupos');
      if (r.status === 'exato') exatos++; else if (r.status === 'parcial') parciais++;
    }
    if (p.nome === EU) meu = pal.palpite;
  }
  const top = Object.entries(placares).sort((x, y) => y[1] - x[1])[0] || ['—', 0];
  const total = estado.palpites.length;
  return { real, casa, empate, fora, total, exatos, parciais, maisVotado: top[0], maisVotadoQtd: top[1], meu };
}

function telaHoje(c) {
  const hoje = hojeBR();
  const todos = jogosUnicos();
  const datas = [...new Set(todos.map((g) => g.data))];

  // jogos de hoje; se não houver, mostra o próximo dia com jogos
  let alvo = hoje, rotulo = 'Hoje';
  let doDia = todos.filter((g) => g.data === hoje);
  if (!doDia.length) {
    const proxima = datas.filter((d) => dataOrd(d) > dataOrd(hoje)).sort((a, b) => dataOrd(a) - dataOrd(b))[0];
    if (proxima) { alvo = proxima; rotulo = 'Próximos jogos'; doDia = todos.filter((g) => g.data === alvo); }
  }

  // cabeçalho do dia
  const r = estado.ranking.find((x) => x.nome === EU);
  const metaPessoal = (!MODO_GRUPO && r) ? ` · você está em <strong>${r.posicao}º</strong> com <strong>${r.pontos} pts</strong>` : '';
  c.appendChild(el(`<div class="hoje-cab">
    <div class="hoje-data">${rotulo === 'Hoje' ? '🔥 Hoje' : '📅 Próximos jogos'} · ${dataLonga(alvo)}</div>
    <div class="hoje-meta">${doDia.length} jogo${doDia.length !== 1 ? 's' : ''}${metaPessoal}</div>
  </div>`));

  if (!doDia.length) {
    c.appendChild(el('<p class="carregando">Sem jogos previstos. A fase de grupos vai de 11 a 27 de junho.</p>'));
    return;
  }

  // ordena por horário (quando houver), depois por grupo
  doDia.sort((a, b) => (horarioDoJogo(a) || '99:99').localeCompare(horarioDoJogo(b) || '99:99') || a.grupo.localeCompare(b.grupo))
    .forEach((g) => c.appendChild(cardPanorama(g)));

  c.appendChild(el('<p class="toggle-hint" style="text-align:center;margin-top:10px">Barra: como os 42 dividiram o palpite (casa / empate / fora). Toque em “Jogos” para ver palpite por palpite.</p>'));
}

function cardPanorama(g) {
  const s = statsJogo(g);
  const pct = (n) => (s.total ? Math.round((n / s.total) * 100) : 0);
  const real = s.real;

  const hora = horarioDoJogo(g);
  const placarBox = real
    ? `<span class="pan-placar">${real.gc}<small> x </small>${real.gf}</span>`
    : hora
      ? `<span class="pan-placar hora">🕒 ${esc(hora)}</span>`
      : `<span class="pan-placar a-jogar">a jogar</span>`;

  // status do meu palpite
  const meuRes = pontosJogo(s.meu, real ? [real.gc, real.gf] : null, 'grupos');

  const linhaResultado = real
    ? `<div class="pan-acertos">🎯 <strong>${s.exatos}</strong> de ${s.total} cravaram o placar · ✅ ${s.parciais} acertaram o resultado</div>`
    : '';

  return el(`<div class="panorama">
    <div class="pan-cab">
      <div class="pan-conf"><span class="grupo-badge">${g.grupo}</span>${esc(g.casa)} <small>x</small> ${esc(g.fora)}</div>
      ${placarBox}
    </div>
    <div class="pan-grupo">
      <div class="pan-rotulo">Palpite do grupo · mais votado <strong>${s.maisVotado}</strong> (${s.maisVotadoQtd})</div>
      <div class="barra-tripla">
        <span class="seg casa" style="width:${pct(s.casa)}%" title="casa">${pct(s.casa) >= 12 ? pct(s.casa) + '%' : ''}</span>
        <span class="seg emp" style="width:${pct(s.empate)}%" title="empate">${pct(s.empate) >= 12 ? pct(s.empate) + '%' : ''}</span>
        <span class="seg fora" style="width:${pct(s.fora)}%" title="fora">${pct(s.fora) >= 12 ? pct(s.fora) + '%' : ''}</span>
      </div>
      <div class="barra-legenda"><span>🟢 ${esc(g.casa)} ${pct(s.casa)}%</span><span>⚪ empate ${pct(s.empate)}%</span><span>🔵 ${esc(g.fora)} ${pct(s.fora)}%</span></div>
    </div>
    ${MODO_GRUPO ? '' : `<div class="pan-eu">
      <span>📝 Seu palpite: <strong>${s.meu ? s.meu[0] + 'x' + s.meu[1] : '—'}</strong></span>
      <span class="chip ${meuRes.status}">${rotuloStatus(meuRes.status, meuRes.pts)}</span>
    </div>`}
    ${linhaResultado}
  </div>`);
}

// ---------- TELA 1: RANKING ----------
// Premiação removida temporariamente (regras em reformulação). Para reativar,
// basta restaurar o painel .premios + a coluna "Prêmio proj." (calcularPremios() segue pronta).
function telaRanking(c) {
  const tbl = el(`<table class="tabela"><thead><tr>
    <th class="num">#</th><th>Participante</th><th class="num">Pts</th>
    <th class="num">Exatos</th><th class="num">Zeros</th>
  </tr></thead><tbody></tbody></table>`);
  const tb = $('tbody', tbl);
  estado.ranking.forEach((l) => {
    const eu = l.nome === EU;
    const medalha = l.posicao <= 3 ? ['🥇', '🥈', '🥉'][l.posicao - 1] : '';
    const acertos = (l.acertouCampeao ? '<span class="tag-acerto" title="acertou o campeão">🏆</span>' : '') +
      (l.acertouArtilheiro ? '<span class="tag-acerto" title="acertou o artilheiro">⚽</span>' : '');
    tb.appendChild(el(`<tr class="${eu ? 'eu' : ''} ${l.posicao <= 3 ? 'topo3' : ''}">
      <td class="num"><span class="pos-medalha">${medalha || l.posicao}</span></td>
      <td><div class="nome-cell">${esc(l.nome)}${acertos}</div></td>
      <td class="pts">${l.pontos}</td>
      <td class="num">${l.exatos}</td>
      <td class="num">${l.zeros}</td>
    </tr>`));
  });
  c.appendChild(tbl);
}

// ---------- TELA 2: JOGOS / RESULTADOS ----------
function jogosUnicos() {
  // lista de jogos (da grade do participante 0), ordenada por data e grupo
  return estado.palpites[0].palpites
    .map((g) => ({ data: g.data, grupo: g.grupo, casa: g.casa, fora: g.fora }))
    .sort((a, b) => dataOrd(a.data) - dataOrd(b.data) || a.grupo.localeCompare(b.grupo));
}

function telaJogos(c) {
  const grupos = [...new Set(jogosUnicos().map((g) => g.grupo))].sort();
  const filtros = el(`<div class="filtros">
    <select id="f-grupo"><option value="">Todos os grupos</option>${grupos.map((g) => `<option ${estado.filtroGrupo === g ? 'selected' : ''}>${g}</option>`).join('')}</select>
    <select id="f-part"><option value="">Todos os participantes</option>${estado.palpites.map((p) => `<option ${estado.filtroParticipante === p.nome ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
  </div>`);
  c.appendChild(filtros);
  $('#f-grupo', filtros).addEventListener('change', (e) => { estado.filtroGrupo = e.target.value; render(); });
  $('#f-part', filtros).addEventListener('change', (e) => { estado.filtroParticipante = e.target.value; render(); });

  let jogos = jogosUnicos();
  if (estado.filtroGrupo) jogos = jogos.filter((g) => g.grupo === estado.filtroGrupo);

  const hoje = hojeBR();
  let diaAtual = null;
  jogos.forEach((g) => {
    if (g.data !== diaAtual) {
      diaAtual = g.data;
      const ehHoje = g.data === hoje;
      c.appendChild(el(`<div class="dia-titulo ${ehHoje ? 'hoje' : ''}">${dataLonga(g.data)}${ehHoje ? ' · HOJE' : ''}</div>`));
    }
    c.appendChild(cardJogo(g));
  });
  if (!jogos.length) c.appendChild(el('<p class="carregando">Nenhum jogo para este filtro.</p>'));
}

function cardJogo(g) {
  const real = realDoJogo(g);
  const hora = horarioDoJogo(g);
  const placar = real
    ? `<span class="placar">${real.gc}<span style="opacity:.4"> x </span>${real.gf}</span>`
    : `<span class="placar pendente">${hora ? '🕒 ' + esc(hora) : 'a jogar'}</span>`;
  const card = el(`<div class="jogo">
    <div class="jogo-cab">
      <div class="conf"><span class="grupo-badge">${g.grupo}</span>${esc(g.casa)} <small style="color:#9aa0a9">x</small> ${esc(g.fora)}</div>
      ${placar}
    </div>
    <div class="palpites-lista"></div>
  </div>`);

  // lista de palpites (todos ou filtrado por participante)
  const lista = $('.palpites-lista', card);
  let parts = estado.palpites;
  if (estado.filtroParticipante) parts = parts.filter((p) => p.nome === estado.filtroParticipante);
  // ordena: maior pontuação primeiro
  const linhas = parts.map((p) => {
    const pal = p.palpites.find((x) => x.casa === g.casa && x.fora === g.fora && x.data === g.data);
    const res = pontosJogo(pal.palpite, real ? [real.gc, real.gf] : null, 'grupos');
    return { nome: p.nome, palpite: pal.palpite, ...res };
  }).sort((a, b) => b.pts - a.pts || a.nome.localeCompare(b.nome));

  linhas.forEach((l) => {
    const eu = l.nome === EU;
    lista.appendChild(el(`<div class="palpite-row ${eu ? 'eu' : ''}">
      <span>${esc(l.nome)}</span>
      <span><span class="pp">${l.palpite[0]}x${l.palpite[1]}</span>
        <span class="chip ${l.status}">${rotuloStatus(l.status, l.pts)}</span></span>
    </div>`));
  });

  $('.jogo-cab', card).addEventListener('click', () => card.classList.toggle('aberto'));
  return card;
}

function rotuloStatus(status, pts) {
  if (status === 'exato') return `+${pts} exato`;
  if (status === 'parcial') return `+${pts}`;
  if (status === 'errou') return '0';
  return '—';
}

// ---------- TELA 3: MINHA COLA ----------
function telaCola(c) {
  const eu = estado.palpites.find((p) => p.nome === EU);
  if (!eu) { c.appendChild(el('<div class="erro">Participante não encontrado.</div>')); return; }
  const hoje = hojeBR();

  // resumo
  const r = estado.ranking.find((x) => x.nome === EU);
  c.appendChild(el(`<section class="cola-resumo">
    <div class="box"><div class="n">${r.pontos}</div><div class="l">pontos</div></div>
    <div class="box"><div class="n">${r.posicao}º</div><div class="l">posição</div></div>
    <div class="box"><div class="n">${r.exatos}</div><div class="l">exatos</div></div>
    <div class="box"><div class="n">${r.zeros}</div><div class="l">zeros</div></div>
  </section>`));
  c.appendChild(el(`<div class="meu-master">⭐ Meus master — Campeão: <strong>${esc(eu.campeao)}</strong> · Artilheiro: <strong>${esc(eu.artilheiro)}</strong></div>`));

  const meusJogos = eu.palpites.map((g) => {
    const real = realDoJogo(g);
    const res = pontosJogo(g.palpite, real ? [real.gc, real.gf] : null, 'grupos');
    return { ...g, real, ...res };
  });

  // jogos de HOJE em destaque
  const hojeJogos = meusJogos.filter((g) => g.data === hoje);
  if (hojeJogos.length) {
    c.appendChild(el('<h2 class="titulo">🔥 Hoje</h2>'));
    const card = el('<div class="card cola-hoje" style="padding:0"></div>');
    hojeJogos.sort((a, b) => a.grupo.localeCompare(b.grupo)).forEach((g) => card.appendChild(linhaCola(g)));
    c.appendChild(card);
  }

  // demais, por data e grupo
  c.appendChild(el('<h2 class="titulo">Todos os meus palpites</h2>'));
  const porData = {};
  meusJogos.forEach((g) => { (porData[g.data] ||= []).push(g); });
  Object.keys(porData).sort((a, b) => dataOrd(a) - dataOrd(b)).forEach((data) => {
    const ehHoje = data === hoje;
    c.appendChild(el(`<div class="dia-titulo ${ehHoje ? 'hoje' : ''}">${dataLonga(data)}${ehHoje ? ' · HOJE' : ''}</div>`));
    const card = el('<div class="card" style="padding:0"></div>');
    porData[data].sort((a, b) => a.grupo.localeCompare(b.grupo)).forEach((g) => card.appendChild(linhaCola(g)));
    c.appendChild(card);
  });
}

function linhaCola(g) {
  const hora = horarioDoJogo(g);
  const realTxt = g.real ? `${g.real.gc}x${g.real.gf}` : (hora ? `🕒 ${esc(hora)}` : '—');
  return el(`<div class="cola-jogo">
    <div class="conf"><span class="grupo-badge">${g.grupo}</span>${esc(g.casa)} x ${esc(g.fora)}
      <br><small>${g.real ? 'resultado: ' : ''}${realTxt}</small></div>
    <div style="text-align:right">
      <div class="meu">${g.palpite[0]}x${g.palpite[1]}</div>
      <span class="chip ${g.status}">${rotuloStatus(g.status, g.pts)}</span>
    </div>
  </div>`);
}

// ---------- TELA 4: MASTER ----------
function telaMaster(c) {
  const eu = estado.palpites.find((p) => p.nome === EU);
  // campeão (texto exato, sem normalização — nomes de seleção são consistentes)
  const campeoes = contar(estado.palpites.map((p) => p.campeao));
  // artilheiro (normalizado)
  const artil = contar(estado.palpites.map((p) => canonArtilheiro(p.artilheiro)));

  const meuCampeao = (!MODO_GRUPO && eu) ? eu.campeao : null;
  const meuArtil = (!MODO_GRUPO && eu) ? canonArtilheiro(eu.artilheiro) : null;
  if (meuCampeao) {
    c.appendChild(el(`<div class="meu-master">⭐ Seus master — Campeão: <strong>${esc(meuCampeao)}</strong> · Artilheiro: <strong>${esc(meuArtil)}</strong></div>`));
  }

  const grid = el('<div class="master-grid"></div>');
  grid.appendChild(blocoBarras('🏆 Campeão', campeoes, meuCampeao, (k) => k));
  grid.appendChild(blocoBarras('⚽ Artilheiro', artil, meuArtil, (k) => k));
  c.appendChild(grid);
}

function contar(arr) {
  const m = {};
  arr.forEach((x) => { m[x] = (m[x] || 0) + 1; });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

function blocoBarras(titulo, dados, meu, keyFn) {
  const total = dados.reduce((s, [, q]) => s + q, 0);
  const max = dados[0] ? dados[0][1] : 1;
  const card = el(`<div class="card"><h2 class="titulo">${titulo}</h2></div>`);
  dados.forEach(([nome, q]) => {
    const ehMeu = keyFn(nome) === meu;
    card.appendChild(el(`<div class="barra-item ${ehMeu ? 'eu' : ''}">
      <div class="barra-topo"><span>${esc(nome)}${ehMeu ? ' (você)' : ''}</span><span class="q">${q}</span></div>
      <div class="barra"><span style="width:${Math.round((q / max) * 100)}%"></span></div>
    </div>`));
  });
  card.appendChild(el(`<p class="toggle-hint" style="margin-top:8px">${total} palpites no total</p>`));
  return card;
}

// ---------- boot ----------
initAbas();
carregar();
