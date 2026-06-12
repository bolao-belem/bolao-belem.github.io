// Testes do motor de pontuação — rode com: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pontosJogo, canonArtilheiro, acertouArtilheiro, acertouCampeao,
  calcularRanking, calcularPremios,
} from '../js/engine.js';

test('grupos: placar exato = 5', () => {
  assert.deepEqual(pontosJogo([3, 0], [3, 0], 'grupos'), { pts: 5, status: 'exato' });
});

test('grupos: vencedor certo placar errado = 2 (palpite 3x0 vs real 1x0)', () => {
  assert.deepEqual(pontosJogo([3, 0], [1, 0], 'grupos'), { pts: 2, status: 'parcial' });
});

test('grupos: errou resultado = 0 (palpite 3x0 vs real 1x1)', () => {
  assert.deepEqual(pontosJogo([3, 0], [1, 1], 'grupos'), { pts: 0, status: 'errou' });
});

test('grupos: empate exato = 5; empate certo placar errado = 2', () => {
  assert.equal(pontosJogo([1, 1], [1, 1], 'grupos').pts, 5);
  assert.equal(pontosJogo([1, 1], [2, 2], 'grupos').pts, 2);
});

test('mata-mata: exato = 8; vencedor/empate = 4', () => {
  assert.equal(pontosJogo([2, 1], [2, 1], 'mata').pts, 8);
  assert.equal(pontosJogo([2, 1], [3, 0], 'mata').pts, 4);
});

test('mata-mata: 1x1 (+pênaltis) vs palpite 2x1 = 0 (90min é empate)', () => {
  // pênaltis não contam; 90' terminou 1x1 (empate) e o palpite previu vitória da casa
  assert.deepEqual(pontosJogo([2, 1], [1, 1], 'mata'), { pts: 0, status: 'errou' });
});

test('mata-mata: empate nos 90 vale como empate (palpite 1x1 vs real 1x1 = 8)', () => {
  assert.equal(pontosJogo([1, 1], [1, 1], 'mata').pts, 8);
});

test('jogo não realizado = pendente, 0 pt', () => {
  assert.deepEqual(pontosJogo([2, 0], null, 'grupos'), { pts: 0, status: 'pendente' });
  assert.deepEqual(pontosJogo([2, 0], [null, null], 'grupos'), { pts: 0, status: 'pendente' });
});

test('normalização de artilheiro: todas as grafias do Mbappé batem', () => {
  for (const g of ['Mbappe', 'Mbappé', 'Mbape', 'Mpabbe', 'MBAPPÉ', 'MBAPPE', 'Mbappé (França)', 'Kylian Mbappé']) {
    assert.equal(canonArtilheiro(g), 'Kylian Mbappé', `falhou: ${g}`);
  }
});

test('normalização: CR7 / Cristiano Ronaldo (GOAT) batem', () => {
  assert.equal(canonArtilheiro('Cristiano Ronaldo (GOAT)'), 'Cristiano Ronaldo');
  assert.equal(canonArtilheiro('Cristiano Ronaldo'), 'Cristiano Ronaldo');
});

test('acertouArtilheiro: empate na artilharia aceita qualquer líder', () => {
  assert.equal(acertouArtilheiro('Mbappe', ['Kylian Mbappé', 'Harry Kane']), true);
  assert.equal(acertouArtilheiro('Endrick', ['Kylian Mbappé', 'Harry Kane']), false);
});

test('acertouCampeao: ignora acento/caixa', () => {
  assert.equal(acertouCampeao('Brasil', 'brasil'), true);
  assert.equal(acertouCampeao('França', 'Franca'), true);
  assert.equal(acertouCampeao('Espanha', 'Brasil'), false);
});

test('premiação: 42 pagantes → pote 6000 (3600/1800/600)', () => {
  assert.deepEqual(calcularPremios(42), { pagantes: 42, pote: 6000, primeiro: 3600, segundo: 1800, terceiro: 600 });
});

test('premiação: nº de pagantes configurável', () => {
  assert.equal(calcularPremios(30).pote, 30 * 150 - 300); // 4200
});

test('ranking: desempate por exatos e depois por zeros', () => {
  const participantes = [
    { nome: 'A', campeao: 'Brasil', artilheiro: 'Mbappe', palpites: [
      { data: '11/06', casa: 'X', fora: 'Y', palpite: [1, 0] },   // exato (5)
      { data: '11/06', casa: 'W', fora: 'Z', palpite: [5, 0] },   // errou (0)
    ]},
    { nome: 'B', campeao: 'Brasil', artilheiro: 'Mbappe', palpites: [
      { data: '11/06', casa: 'X', fora: 'Y', palpite: [2, 1] },   // parcial (2)
      { data: '11/06', casa: 'W', fora: 'Z', palpite: [0, 0] },   // parcial (2)... real 0x0 empate
    ]},
  ];
  const resultados = { grupos: {
    '11/06 | X x Y': { gc: 1, gf: 0 },
    '11/06 | W x Z': { gc: 0, gf: 0 },
  }, master: {} };
  const rank = calcularRanking(participantes, resultados);
  // A: 5+0=5pts, 1 exato, 1 zero. B: 2+2=4pts, 0 exato, 0 zero. A vence por pontos.
  assert.equal(rank[0].nome, 'A');
  assert.equal(rank[0].pontos, 5);
  assert.equal(rank[0].exatos, 1);
  assert.equal(rank[0].zeros, 1);
  assert.equal(rank[1].pontos, 4);
});
