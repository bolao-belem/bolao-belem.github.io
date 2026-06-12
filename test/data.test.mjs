// Valida a integridade dos dados-fonte do bolão.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chaveJogo } from '../js/engine.js';

const dir = dirname(fileURLToPath(import.meta.url));
const ler = (f) => JSON.parse(readFileSync(join(dir, '..', 'data', f), 'utf8'));
const palpites = ler('bolao_palpites_todos.json');
const resultados = ler('resultados.json');
const jogos = ler('jogos.json');
const compactos = ler('palpites.json');

test('42 participantes', () => {
  assert.equal(palpites.length, 42);
});

test('cada participante tem exatamente 72 palpites (42 × 72 = 3024)', () => {
  let total = 0;
  for (const p of palpites) {
    assert.equal(p.palpites.length, 72, `${p.nome} tem ${p.palpites.length}`);
    total += p.palpites.length;
  }
  assert.equal(total, 3024);
});

test('todos têm campeão e artilheiro preenchidos', () => {
  for (const p of palpites) {
    assert.ok(p.campeao, `${p.nome} sem campeão`);
    assert.ok(p.artilheiro, `${p.nome} sem artilheiro`);
  }
});

test('Marcelo Gaspar Garcia está na lista', () => {
  assert.ok(palpites.some((p) => p.nome === 'Marcelo Gaspar Garcia'));
});

test('resultados.json cobre exatamente os 72 jogos dos palpites', () => {
  const chavesResultado = new Set(Object.keys(resultados.grupos));
  assert.equal(chavesResultado.size, 72);
  for (const g of palpites[0].palpites) {
    assert.ok(chavesResultado.has(chaveJogo(g)), `faltou: ${chaveJogo(g)}`);
  }
});

test('todos os participantes preveem a mesma lista de 72 jogos', () => {
  const ref = palpites[0].palpites.map(chaveJogo).join(';');
  for (const p of palpites) {
    assert.equal(p.palpites.map(chaveJogo).join(';'), ref, `${p.nome} difere`);
  }
});

// --- formato leve (normalizado) ---
test('jogos.json tem 72 jogos com os campos data/grupo/casa/fora', () => {
  assert.equal(jogos.length, 72);
  for (const g of jogos) assert.ok(g.data && g.grupo && g.casa && g.fora);
});

test('palpites.json: 42 participantes, cada um com 72 pares [gc,gf]', () => {
  assert.equal(compactos.length, 42);
  for (const c of compactos) {
    assert.equal(c.p.length, 72, `${c.nome}`);
    for (const par of c.p) assert.equal(par.length, 2);
  }
});

test('formato leve re-hidrata IGUAL à fonte original (sem perda de dado)', () => {
  for (let i = 0; i < palpites.length; i++) {
    const orig = palpites[i];
    const c = compactos[i];
    assert.equal(c.nome, orig.nome);
    assert.equal(c.campeao, orig.campeao);
    assert.equal(c.artilheiro, orig.artilheiro);
    for (let j = 0; j < 72; j++) {
      assert.deepEqual(c.p[j], orig.palpites[j].palpite, `${orig.nome} jogo ${j}`);
      assert.equal(jogos[j].casa, orig.palpites[j].casa);
      assert.equal(jogos[j].fora, orig.palpites[j].fora);
    }
  }
});

test('resultados.json tem o campo horario em todos os jogos', () => {
  for (const v of Object.values(resultados.grupos)) {
    assert.ok('horario' in v, 'faltou campo horario');
  }
});
