// Motor de pontuação do Bolão da Copa 2026.
// ES module puro (sem dependências) — roda no browser e no Node (testes).
// Regras oficiais implementadas exatamente conforme MEMORIA_BOLAO_COPA_2026.md.

export const PONTOS = {
  grupos: { exato: 5, parcial: 2 },
  mata: { exato: 8, parcial: 4 },
  master: { campeao: 5, artilheiro: 5 },
};

// ---------------------------------------------------------------------------
// Pontuação de um jogo.
//   palpite: [gc, gf]
//   real:    [gc, gf] ou null/[null,null] se não jogado
//   fase:    'grupos' | 'mata'
// Mata-mata: 'real' deve conter SÓ o placar dos 90min+acréscimos.
// Retorna { pts, status } com status: 'pendente'|'exato'|'parcial'|'errou'.
// ---------------------------------------------------------------------------
export function pontosJogo(palpite, real, fase = 'grupos') {
  const tab = fase === 'mata' ? PONTOS.mata : PONTOS.grupos;
  if (!palpite || palpite[0] == null || palpite[1] == null) {
    return { pts: 0, status: 'pendente' };
  }
  if (!real || real[0] == null || real[1] == null) {
    return { pts: 0, status: 'pendente' };
  }
  const [pgc, pgf] = palpite;
  const [rgc, rgf] = real;
  if (pgc === rgc && pgf === rgf) return { pts: tab.exato, status: 'exato' };
  // Math.sign: 1 = casa vence, -1 = fora vence, 0 = empate
  if (Math.sign(pgc - pgf) === Math.sign(rgc - rgf)) {
    return { pts: tab.parcial, status: 'parcial' };
  }
  return { pts: 0, status: 'errou' };
}

// ---------------------------------------------------------------------------
// Normalização de nomes de artilheiro (grafias variadas → nome canônico).
// ---------------------------------------------------------------------------
function chave(nome) {
  return (nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/\(.*?\)/g, '')         // remove "(GOAT)", "(França)"
    .replace(/[^a-z ]/g, '')
    .trim();
}

const ALIASES = [
  { canon: 'Kylian Mbappé', keys: ['mbappe', 'mbape', 'mpabbe', 'kylian mbappe', 'mbappe franca'] },
  { canon: 'Cristiano Ronaldo', keys: ['cristiano ronaldo', 'cr', 'cr7', 'cristiano'] },
  { canon: 'Lionel Messi', keys: ['messi', 'lionel messi'] },
  { canon: 'Mikel Oyarzabal', keys: ['oyarzabal', 'mikel oyarzabal'] },
  { canon: 'Harry Kane', keys: ['kane', 'harry kane'] },
  { canon: 'Erling Haaland', keys: ['haaland', 'erling haaland'] },
  { canon: 'Vini Jr', keys: ['vini jr', 'vinicius junior', 'vinicius jr', 'vini'] },
  { canon: 'Lamine Yamal', keys: ['lamine yamal', 'yamal'] },
  { canon: 'Endrick', keys: ['endrick'] },
  { canon: 'Neymar', keys: ['neymar'] },
  { canon: 'Marquinhos', keys: ['markinhos', 'marquinhos'] },
];

const ALIAS_MAP = (() => {
  const m = new Map();
  for (const a of ALIASES) for (const k of a.keys) m.set(k, a.canon);
  return m;
})();

export function canonArtilheiro(nome) {
  const k = chave(nome);
  if (!k) return '';
  if (ALIAS_MAP.has(k)) return ALIAS_MAP.get(k);
  // título: cada palavra capitalizada (mantém comparável e legível)
  return k.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Comparação de artilheiro: real pode ser string OU lista (empate na artilharia).
export function acertouArtilheiro(palpiteNome, realNomeOuLista) {
  if (!realNomeOuLista) return false;
  const alvo = canonArtilheiro(palpiteNome);
  const lista = Array.isArray(realNomeOuLista) ? realNomeOuLista : [realNomeOuLista];
  return lista.some((r) => canonArtilheiro(r) === alvo);
}

function normSimples(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export function acertouCampeao(palpiteCampeao, realCampeao) {
  if (!realCampeao) return false;
  return normSimples(palpiteCampeao) === normSimples(realCampeao);
}

// ---------------------------------------------------------------------------
// Chave única de um jogo (casa o palpite com o resultado).
// ---------------------------------------------------------------------------
export function chaveJogo(g) {
  return `${g.data} | ${g.casa} x ${g.fora}`;
}

// ---------------------------------------------------------------------------
// Calcula a pontuação completa de UM participante.
//   participante: { nome, campeao, artilheiro, palpites: [...] }
//   resultados:   objeto resultados.json já parseado
//   matamata:     objeto palpites_matamata.json (opcional)
// Retorna métricas + detalhe por jogo.
// ---------------------------------------------------------------------------
export function pontuarParticipante(participante, resultados, matamata) {
  const grupos = resultados.grupos || {};
  const master = resultados.master || {};
  let pontos = 0;
  let exatos = 0;
  let zeros = 0; // jogos JOGADOS com 0 pt
  const detalhe = [];

  for (const g of participante.palpites) {
    const r = grupos[chaveJogo(g)];
    const real = r && r.gc != null && r.gf != null ? [r.gc, r.gf] : null;
    const res = pontosJogo(g.palpite, real, 'grupos');
    pontos += res.pts;
    if (res.status === 'exato') exatos++;
    if (res.status === 'errou') zeros++;
    detalhe.push({ ...g, real, ...res });
  }

  // Mata-mata (quando houver palpites e resultados registrados)
  if (matamata && matamata.fases) {
    for (const [faseNome, fase] of Object.entries(matamata.fases)) {
      const meus = (fase.palpites && fase.palpites[participante.nome]) || {};
      for (const jogo of fase.jogos || []) {
        const palpite = meus[jogo.id];
        const rr = fase.resultados && fase.resultados[jogo.id];
        const real = rr && rr.gc != null && rr.gf != null ? [rr.gc, rr.gf] : null;
        const res = pontosJogo(palpite, real, 'mata');
        pontos += res.pts;
        if (res.status === 'exato') exatos++;
        if (res.status === 'errou') zeros++;
        detalhe.push({
          data: jogo.data, grupo: faseNome, casa: jogo.casa, fora: jogo.fora,
          palpite, real, ...res, mata: true,
        });
      }
    }
  }

  // Master (liquidam no fim da Copa)
  const accCampeao = acertouCampeao(participante.campeao, master.campeao);
  const accArtilheiro = acertouArtilheiro(participante.artilheiro, master.artilheiro);
  if (accCampeao) pontos += PONTOS.master.campeao;
  if (accArtilheiro) pontos += PONTOS.master.artilheiro;

  return {
    nome: participante.nome,
    campeao: participante.campeao,
    artilheiro: participante.artilheiro,
    pontos, exatos, zeros,
    acertouCampeao: accCampeao,
    acertouArtilheiro: accArtilheiro,
    detalhe,
  };
}

// ---------------------------------------------------------------------------
// Ranking com critérios de desempate (nesta ordem):
//   1) mais pontos  2) mais exatos  3) menos zeros
//   4) acertou campeão  5) acertou artilheiro  6) nome (estável)
// ---------------------------------------------------------------------------
export function calcularRanking(participantes, resultados, matamata) {
  const linhas = participantes.map((p) => pontuarParticipante(p, resultados, matamata));
  linhas.sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    if (b.exatos !== a.exatos) return b.exatos - a.exatos;
    if (a.zeros !== b.zeros) return a.zeros - b.zeros;
    if (a.acertouCampeao !== b.acertouCampeao) return a.acertouCampeao ? -1 : 1;
    if (a.acertouArtilheiro !== b.acertouArtilheiro) return a.acertouArtilheiro ? -1 : 1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
  // posição com empate real compartilhado (mesma posição se tudo empatar)
  let pos = 0, ant = null;
  linhas.forEach((l, i) => {
    const assinatura = `${l.pontos}|${l.exatos}|${l.zeros}|${l.acertouCampeao}|${l.acertouArtilheiro}`;
    if (assinatura !== ant) { pos = i + 1; ant = assinatura; }
    l.posicao = pos;
  });
  return linhas;
}

// ---------------------------------------------------------------------------
// Premiação: pote = pagantes × 150 − 300 (2 cotas da organização). 60/30/10.
// ---------------------------------------------------------------------------
export function calcularPremios(pagantes = 42) {
  const pote = Math.max(0, pagantes * 150 - 300);
  return {
    pagantes,
    pote,
    primeiro: Math.round(pote * 0.6),
    segundo: Math.round(pote * 0.3),
    terceiro: Math.round(pote * 0.1),
  };
}
