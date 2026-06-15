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
  filtroGrupo: '', filtroParticipante: '', diaSel: null, diaSelDia: null,
  placaresAbertos: new Set(), // chaves de jogo com o buscador "quem apostou" aberto (sobrevive ao re-render)
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
function dataParaDate(dStr) { const [dd, mm] = dStr.split('/'); return new Date(2026, Number(mm) - 1, Number(dd)); }
function rotuloDia(d, hoje) {
  const dif = Math.round((dataParaDate(hoje) - dataParaDate(d)) / 86400000);
  return dif === 0 ? 'Hoje' : dif === 1 ? 'Ontem' : dif === 2 ? 'Anteontem' : dataLonga(d);
}
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
    iniciarAoVivo(); // passa a buscar placares ao vivo (TheSportsDB) e auto-atualizar
  } catch (e) {
    $('#conteudo').innerHTML = `<div class="erro">Erro ao carregar os dados: ${esc(e.message)}.<br>Confirme que os arquivos em <code>data/</code> existem.</div>`;
    console.error(e);
  }
}

// ===========================================================================
// AO VIVO — busca os placares direto da API pública da ESPN no navegador
// (CORS liberado, grátis, SEM chave, SEM servidor). Uma única chamada traz a Copa
// inteira (grupos + mata-mata). Atualiza sozinho a cada 60s, então o site reflete
// o fim de cada jogo em ~1 min, sem depender do robô lento do GitHub.
// ===========================================================================
const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719';
const INTERVALO_AO_VIVO = 60000;

function norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
}

// Nome do time na API (inglês, ESPN) → nome em português usado no bolão.
const TIME_EN_PT = {
  mexico: 'México', southafrica: 'África do Sul', southkorea: 'Coreia do Sul', korearepublic: 'Coreia do Sul',
  czechrepublic: 'República Tcheca', czechia: 'República Tcheca', canada: 'Canadá', qatar: 'Catar',
  switzerland: 'Suíça', bosniaherzegovina: 'Bósnia e Herzegovina', bosniaandherzegovina: 'Bósnia e Herzegovina',
  brazil: 'Brasil', morocco: 'Marrocos', haiti: 'Haiti', scotland: 'Escócia',
  usa: 'Estados Unidos', unitedstates: 'Estados Unidos', paraguay: 'Paraguai', australia: 'Austrália',
  turkey: 'Turquia', turkiye: 'Turquia', germany: 'Alemanha', curacao: 'Curaçao',
  ivorycoast: 'Costa do Marfim', cotedivoire: 'Costa do Marfim', ecuador: 'Equador',
  netherlands: 'Holanda', japan: 'Japão', tunisia: 'Tunísia', sweden: 'Suécia',
  belgium: 'Bélgica', egypt: 'Egito', iran: 'Irã', iriran: 'Irã', newzealand: 'Nova Zelândia',
  spain: 'Espanha', capeverde: 'Cabo Verde', saudiarabia: 'Arábia Saudita', uruguay: 'Uruguai',
  france: 'França', senegal: 'Senegal', norway: 'Noruega', iraq: 'Iraque',
  argentina: 'Argentina', algeria: 'Argélia', austria: 'Áustria', jordan: 'Jordânia',
  portugal: 'Portugal', uzbekistan: 'Uzbequistão', colombia: 'Colômbia',
  drcongo: 'RD Congo', congodr: 'RD Congo', democraticrepublicofcongo: 'RD Congo',
  england: 'Inglaterra', croatia: 'Croácia', ghana: 'Gana', panama: 'Panamá',
};
const ptDoTime = (en) => TIME_EN_PT[norm(en)];

// índice dos nossos jogos por par de times (sem ordem) → chave + orientação
function indiceParTimes() {
  const idx = {};
  for (const g of estado.palpites[0].palpites) {
    const k = [norm(g.casa), norm(g.fora)].sort().join('|');
    idx[k] = { chave: chaveJogo(g), casaNorm: norm(g.casa) };
  }
  return idx;
}

async function aplicarResultadosAoVivo() {
  let dados;
  try {
    const r = await fetch(ESPN_URL, { cache: 'no-store' });
    if (!r.ok) return 0;
    dados = await r.json();
  } catch (e) { return 0; }
  const eventos = (dados && dados.events) || [];
  const idx = indiceParTimes();
  let aplicados = 0;
  for (const e of eventos) {
    const tipo = e.status && e.status.type;
    if (!tipo || tipo.state !== 'post') continue; // só jogo finalizado (placar final dos 90')
    const comp = e.competitions && e.competitions[0];
    const cs = (comp && comp.competitors) || [];
    const home = cs.find((x) => x.homeAway === 'home');
    const away = cs.find((x) => x.homeAway === 'away');
    if (!home || !away) continue;
    const casaPT = ptDoTime(home.team && home.team.displayName);
    const foraPT = ptDoTime(away.team && away.team.displayName);
    if (!casaPT || !foraPT) continue;
    // casa por par de times (só os 72 jogos de grupo entram no índice → mata-mata fica manual)
    const ref = idx[[norm(casaPT), norm(foraPT)].sort().join('|')];
    if (!ref) continue;
    const alvo = estado.resultados.grupos[ref.chave];
    if (!alvo) continue;
    const casaEhHome = ref.casaNorm === norm(casaPT);
    const gc = Number(casaEhHome ? home.score : away.score);
    const gf = Number(casaEhHome ? away.score : home.score);
    if (Number.isNaN(gc) || Number.isNaN(gf)) continue;
    if (alvo.gc !== gc || alvo.gf !== gf) { alvo.gc = gc; alvo.gf = gf; aplicados++; }
  }
  if (aplicados) recalcular();
  return aplicados;
}

function carimboAoVivo(ok) {
  const d = new Date();
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  $('#atualizado').textContent = ok ? `🟢 ao vivo · ${hhmm}` : (estado.resultados.atualizado_em ? `atualizado: ${estado.resultados.atualizado_em}` : 'aguardando 1º resultado');
}

function iniciarAoVivo() {
  if (window.__BOLAO_DADOS__) return; // versão offline não busca ao vivo
  const tick = async () => {
    const n = await aplicarResultadosAoVivo();
    if (n) { const y = window.scrollY; render(); window.scrollTo(0, y); } // re-render sem pular o scroll
    carimboAoVivo(true);
  };
  tick();
  setInterval(tick, INTERVALO_AO_VIVO);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
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

// Resenha do dia: craque (mais pontos hoje), bola murcha (zerou, melhor colocado),
// e chute mais doido (maior erro de placar entre os jogos resolvidos de hoje).
function resenhaDoDia(dia) {
  const linhas = estado.ranking.map((l) => {
    const resolv = l.detalhe.filter((d) => d.data === dia && d.status !== 'pendente');
    return { nome: l.nome, posicao: l.posicao, n: resolv.length, pts: resolv.reduce((s, d) => s + d.pts, 0), jogos: resolv };
  }).filter((x) => x.n > 0);
  if (!linhas.length) return null;

  // craque = quem MAIS pontuou no dia (trata empate com "e mais N", igual à bola murcha)
  const maxPts = Math.max(...linhas.map((x) => x.pts));
  const melhores = linhas.filter((x) => x.pts === maxPts).sort((a, b) => a.posicao - b.posicao);
  const destaque = maxPts > 0 ? { nome: melhores[0].nome, pts: maxPts, n: melhores.length } : null;
  // bola murcha = quem MENOS pontuou no dia (lanterna da rodada)
  const minPts = Math.min(...linhas.map((x) => x.pts));
  const piores = linhas.filter((x) => x.pts === minPts).sort((a, b) => a.posicao - b.posicao);
  const bolaMurcha = (minPts < maxPts) ? { nome: piores[0].nome, pts: minPts, n: piores.length } : null;

  let absurdo = null, maxErro = -1;
  for (const x of linhas) {
    for (const j of x.jogos) {
      if (!j.real || !j.palpite || j.status !== 'errou') continue;
      const erro = Math.abs(j.palpite[0] - j.real[0]) + Math.abs(j.palpite[1] - j.real[1]);
      if (erro > maxErro) { maxErro = erro; absurdo = { nome: x.nome, casa: j.casa, fora: j.fora, palpite: j.palpite, real: j.real }; }
    }
  }

  // 🦓 zebra: o resultado do dia que MENOS gente acertou (mais surpreendente)
  let zebra = null, minAcerto = Infinity;
  for (const g of estado.palpites[0].palpites) {
    if (g.data !== dia) continue;
    const s = statsJogo(g);
    if (!s.real) continue;
    const acertaram = s.exatos + s.parciais; // cravaram + acertaram o resultado
    if (acertaram < minAcerto) {
      minAcerto = acertaram;
      const realSign = Math.sign(s.real.gc - s.real.gf);
      const favCount = Math.max(s.casa, s.empate, s.fora);
      const empatesNoTopo = [s.casa, s.empate, s.fora].filter((v) => v === favCount).length;
      let favNome = 'empate', favSign = 0;
      if (favCount === s.casa) { favNome = g.casa; favSign = 1; }
      else if (favCount === s.fora) { favNome = g.fora; favSign = -1; }
      // só acusa um favorito se ele for único (sem empate de votos) e tiver perdido
      const jab = (empatesNoTopo === 1 && favSign !== realSign) ? favNome : null;
      zebra = { casa: g.casa, fora: g.fora, gc: s.real.gc, gf: s.real.gf, acertaram, total: s.total, jab };
    }
  }
  if (zebra && zebra.acertaram / zebra.total > 0.30) zebra = null; // só conta se foi mesmo surpresa

  return { destaque, bolaMurcha, zebra, absurdo };
}

function telaHoje(c) {
  const hoje = hojeBR();
  // virou o dia? esquece a seleção antiga e volta a abrir no dia corrente (seleção explícita só vale no mesmo dia)
  if (estado.diaSelDia !== hoje) { estado.diaSel = null; estado.diaSelDia = hoje; }
  const todos = jogosUnicos();
  const datas = [...new Set(todos.map((g) => g.data))].sort((a, b) => dataOrd(a) - dataOrd(b));

  // dias selecionáveis: do início da Copa até hoje. Antes da Copa, mostra o 1º dia.
  let dias = datas.filter((d) => dataOrd(d) <= dataOrd(hoje));
  if (!dias.length) dias = [datas[0]];

  // dia escolhido no seletor (se ainda válido) ou o mais recente
  const alvo = (estado.diaSel && dias.includes(estado.diaSel)) ? estado.diaSel : dias[dias.length - 1];
  estado.diaSel = alvo;
  const ehHoje = alvo === hoje;
  const doDia = todos.filter((g) => g.data === alvo);

  // 📅 seletor de dias (Hoje · Ontem · Anteontem · …) — mais recente primeiro
  if (dias.length > 1) {
    const nav = el('<div class="dia-nav"></div>');
    [...dias].reverse().forEach((d) => {
      const chip = el(`<button class="dia-chip${d === alvo ? ' ativo' : ''}" type="button">${rotuloDia(d, hoje)}</button>`);
      chip.addEventListener('click', () => { estado.diaSel = d; render(); window.scrollTo({ top: 0 }); });
      nav.appendChild(chip);
    });
    c.appendChild(nav);
    const ativoEl = nav.querySelector('.dia-chip.ativo');
    if (ativoEl) nav.scrollLeft = ativoEl.offsetLeft - nav.clientWidth / 2 + ativoEl.offsetWidth / 2;
  }

  // cabeçalho do dia
  const r = estado.ranking.find((x) => x.nome === EU);
  const metaPessoal = (!MODO_GRUPO && r) ? ` · você está em <strong>${r.posicao}º</strong> com <strong>${r.pontos} pts</strong>` : '';
  c.appendChild(el(`<div class="hoje-cab">
    <div class="hoje-data">${ehHoje ? '🔥 Hoje' : '📅 ' + rotuloDia(alvo, hoje)} · ${dataLonga(alvo)}</div>
    <div class="hoje-meta">${doDia.length} jogo${doDia.length !== 1 ? 's' : ''}${metaPessoal}</div>
  </div>`));

  if (!doDia.length) {
    c.appendChild(el('<p class="carregando">Sem jogos previstos. A fase de grupos vai de 11 a 27 de junho.</p>'));
    return;
  }

  // 🍻 Resenha do dia — craque, bola murcha e chute mais doido (só com jogos já resolvidos)
  const rz = resenhaDoDia(alvo);
  if (rz) {
    const linhas = [];
    if (rz.destaque) { const dq = rz.destaque; linhas.push(`<div class="rz-item">🏆 <strong>Craque da rodada:</strong> ${esc(dq.nome)}${dq.n > 1 ? ` e mais ${dq.n - 1}` : ''} fez <b>+${dq.pts}</b> — tá voando! 🛫</div>`); }
    if (rz.bolaMurcha) { const bm = rz.bolaMurcha; const t = bm.pts === 0 ? 'zerou' : `só <b>+${bm.pts}</b>`; linhas.push(`<div class="rz-item">💨 <strong>Bola murcha:</strong> ${esc(bm.nome)}${bm.n > 1 ? ` e mais ${bm.n - 1}` : ''} — ${t} — paga a saideira 😬</div>`); }
    if (rz.zebra) { const z = rz.zebra; linhas.push(`<div class="rz-item">🦓 <strong>Zebra que ninguém viu:</strong> ${esc(z.casa)} <b>${z.gc}×${z.gf}</b> ${esc(z.fora)} — só <b>${z.acertaram}</b> de ${z.total} acertaram${z.jab ? ` (a maioria apostou em ${esc(z.jab)})` : ''} 😱</div>`); }
    if (rz.absurdo) linhas.push(`<div class="rz-item">🤡 <strong>Chute mais doido:</strong> ${esc(rz.absurdo.nome)} cravou <b>${rz.absurdo.palpite[0]}×${rz.absurdo.palpite[1]}</b> em ${esc(rz.absurdo.casa)} × ${esc(rz.absurdo.fora)}… e deu <b>${rz.absurdo.real[0]}×${rz.absurdo.real[1]}</b> 🫠</div>`);
    const titulo = ehHoje ? 'Resenha do dia' : `Resenha de ${rotuloDia(alvo, hoje).toLowerCase()}`;
    c.appendChild(el(`<div class="resenha"><div class="rz-tit">🍻 ${titulo}</div>${linhas.join('')}</div>`));
  } else if (ehHoje) {
    c.appendChild(el('<div class="resenha-teaser">🍻 A resenha do dia começa assim que os jogos acabarem…</div>'));
  }

  // ordena por horário (quando houver), depois por grupo
  doDia.sort((a, b) => (horarioDoJogo(a) || '99:99').localeCompare(horarioDoJogo(b) || '99:99') || a.grupo.localeCompare(b.grupo))
    .forEach((g) => c.appendChild(cardPanorama(g)));

  c.appendChild(el('<p class="toggle-hint" style="text-align:center;margin-top:10px">Barra: como os 42 dividiram o palpite (casa / empate / fora). Toque em “Jogos” para ver palpite por palpite.</p>'));
}

function cardPanorama(g) {
  const s = statsJogo(g);
  const chaveP = chaveJogo(g);
  const aberto0 = estado.placaresAbertos.has(chaveP); // mantém o buscador aberto através do re-render ao vivo
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

  // buscador de placar: participantes agrupados por placar predito
  const realKey = real ? `${real.gc}x${real.gf}` : null;
  const placaresHtml = placaresDoJogo(g).map((gr) => `<div class="pl-linha${gr.placar === realKey ? ' atual' : ''}">
      <span class="pl-score">${gr.placar.replace('x', '×')}</span><span class="pl-qtd">${gr.qtd}</span>
      <span class="pl-nomes">${gr.nomes.map(esc).join(', ')}</span>
    </div>`).join('');

  const card = el(`<div class="panorama">
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
    <button class="pan-toggle" type="button">${aberto0 ? '🔼 Fechar' : '🔎 Quem apostou cada placar'}</button>
    <div class="pan-placares"${aberto0 ? '' : ' hidden'}>
      ${realKey ? `<div class="pl-hint">🎯 Placar do jogo: <strong>${realKey.replace('x', '×')}</strong> (quem cravou fica em verde)</div>` : ''}
      ${placaresHtml}
    </div>
  </div>`);

  const btn = card.querySelector('.pan-toggle');
  const box = card.querySelector('.pan-placares');
  btn.addEventListener('click', () => {
    if (box.hasAttribute('hidden')) { box.removeAttribute('hidden'); btn.textContent = '🔼 Fechar'; estado.placaresAbertos.add(chaveP); }
    else { box.setAttribute('hidden', ''); btn.textContent = '🔎 Quem apostou cada placar'; estado.placaresAbertos.delete(chaveP); }
  });
  return card;
}

// agrupa os 42 participantes pelo placar exato que cada um cravou para o jogo
function placaresDoJogo(g) {
  const grupos = {};
  for (const p of estado.palpites) {
    const pal = p.palpites.find((x) => x.casa === g.casa && x.fora === g.fora && x.data === g.data);
    if (!pal) continue;
    const k = `${pal.palpite[0]}x${pal.palpite[1]}`;
    (grupos[k] = grupos[k] || []).push(p.nome);
  }
  return Object.entries(grupos)
    .map(([placar, nomes]) => ({ placar, qtd: nomes.length, nomes: nomes.sort((a, b) => a.localeCompare(b, 'pt-BR')) }))
    .sort((a, b) => b.qtd - a.qtd || a.placar.localeCompare(b.placar));
}

// ---------- TELA 1: RANKING ----------
// Premiação removida temporariamente (regras em reformulação). Para reativar,
// basta restaurar o painel .premios + a coluna "Prêmio proj." (calcularPremios() segue pronta).
function telaRanking(c) {
  const hoje = hojeBR();
  // pontos ganhos HOJE por participante (só jogos de hoje já resolvidos)
  const ganhos = estado.ranking.map((l) => {
    const resolv = l.detalhe.filter((d) => d.data === hoje && d.status !== 'pendente');
    return { n: resolv.length, pts: resolv.reduce((s, d) => s + d.pts, 0) };
  });
  const maxHoje = Math.max(0, ...ganhos.map((g) => g.pts));
  const algumHoje = ganhos.some((g) => g.n > 0);

  // resumo do dia (mito + zerados) — só quando já houve jogo resolvido hoje
  if (algumHoje) {
    const mitos = estado.ranking.filter((l, i) => maxHoje > 0 && ganhos[i].pts === maxHoje).map((l) => l.nome);
    const zerados = ganhos.filter((g) => g.n > 0 && g.pts === 0).length;
    c.appendChild(el(`<div class="resumo-dia">
      ${mitos.length ? `<span>🔥 <strong>Mito do dia:</strong> ${esc(mitos[0])}${mitos.length > 1 ? ` e mais ${mitos.length - 1}` : ''} · <strong>+${maxHoje}</strong> pts</span>` : ''}
      ${zerados ? `<span>💀 <strong>${zerados}</strong> zeraram hoje</span>` : ''}
    </div>`));
  }

  const tbl = el(`<table class="tabela"><thead><tr>
    <th class="num">#</th><th>Participante</th><th class="num">Pts</th>
    <th class="num">Hoje</th><th class="num">Exa</th><th class="num">Zero</th>
  </tr></thead><tbody></tbody></table>`);
  const tb = $('tbody', tbl);
  estado.ranking.forEach((l, i) => {
    const eu = l.nome === EU;
    const g = ganhos[i];
    const medalha = l.posicao <= 3 ? ['🥇', '🥈', '🥉'][l.posicao - 1] : '';
    const acertos = (l.acertouCampeao ? '<span class="tag-acerto" title="acertou o campeão">🏆</span>' : '') +
      (l.acertouArtilheiro ? '<span class="tag-acerto" title="acertou o artilheiro">⚽</span>' : '');
    let hojeCell;
    if (g.n === 0) hojeCell = '<span class="hoje-delta neutro">—</span>';
    else if (g.pts > 0) hojeCell = `<span class="hoje-delta mais">+${g.pts}</span>`;
    else hojeCell = '<span class="hoje-delta zero">0</span>';
    tb.appendChild(el(`<tr class="${eu ? 'eu' : ''} ${l.posicao <= 3 ? 'topo3' : ''}">
      <td class="num"><span class="pos-medalha">${medalha || l.posicao}</span></td>
      <td><div class="nome-cell">${esc(l.nome)}${acertos}</div></td>
      <td class="pts">${l.pontos}</td>
      <td class="num">${hojeCell}</td>
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
