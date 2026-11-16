// node --test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { atualizar, diaDe, estadoVazio, maisRecente, mudouOSuficiente, DIAS_GUARDADOS } from './verificar.mjs';

const C = [{ id: 'a', nome: 'A', descricao: 'serviço A' }];
const t = (iso) => new Date(iso);

test('tudo a responder: operacional, um dia com uma verificação', () => {
  const e = atualizar(estadoVazio(), { a: true }, t('2026-11-16T10:00:00Z'), C);
  assert.equal(e.componentes.a.estado, 'operacional');
  assert.deepEqual(e.componentes.a.dias['2026-11-16'], { verificacoes: 1, falhas: 0, confirmadas: 0 });
  assert.equal(e.ultimaVerificacao, '2026-11-16T10:00:00.000Z');
});

test('uma falha isolada não dá o serviço por em baixo', () => {
  let e = atualizar(estadoVazio(), { a: true }, t('2026-11-16T10:00:00Z'), C);
  e = atualizar(e, { a: false }, t('2026-11-16T10:05:00Z'), C);
  assert.equal(e.componentes.a.estado, 'a-confirmar');
  assert.deepEqual(e.componentes.a.dias['2026-11-16'], { verificacoes: 2, falhas: 1, confirmadas: 0 });
  e = atualizar(e, { a: true }, t('2026-11-16T10:10:00Z'), C);
  assert.equal(e.componentes.a.estado, 'operacional');
  assert.equal(e.componentes.a.dias['2026-11-16'].confirmadas, 0);
});

test('duas falhas seguidas confirmam e contam as duas; a terceira conta mais uma', () => {
  let e = atualizar(estadoVazio(), { a: false }, t('2026-11-16T10:00:00Z'), C);
  e = atualizar(e, { a: false }, t('2026-11-16T10:05:00Z'), C);
  assert.equal(e.componentes.a.estado, 'em-baixo');
  assert.equal(e.componentes.a.dias['2026-11-16'].confirmadas, 2);
  e = atualizar(e, { a: false }, t('2026-11-16T10:10:00Z'), C);
  assert.deepEqual(e.componentes.a.dias['2026-11-16'], { verificacoes: 3, falhas: 3, confirmadas: 3 });
  e = atualizar(e, { a: true }, t('2026-11-16T10:15:00Z'), C);
  assert.equal(e.componentes.a.estado, 'operacional');
  assert.equal(e.componentes.a.falhasSeguidas, 0);
});

test('uma série que atravessa a meia-noite não conta mais falhas do que verificações', () => {
  let e = atualizar(estadoVazio(), { a: false }, t('2026-11-16T23:58:00Z'), C);
  e = atualizar(e, { a: false }, t('2026-11-17T00:03:00Z'), C);
  assert.deepEqual(e.componentes.a.dias['2026-11-17'], { verificacoes: 1, falhas: 1, confirmadas: 1 });
});

test('só se guardam os últimos 90 dias', () => {
  const antigo = {
    versao: 1,
    ultimaVerificacao: '2026-01-01T00:00:00.000Z',
    componentes: {
      a: {
        falhasSeguidas: 0,
        dias: {
          '2026-01-01': { verificacoes: 1, falhas: 0, confirmadas: 0 },
          '2026-08-19': { verificacoes: 1, falhas: 0, confirmadas: 0 },
          '2026-08-18': { verificacoes: 1, falhas: 0, confirmadas: 0 },
        },
      },
    },
  };
  const e = atualizar(antigo, { a: true }, t('2026-11-16T10:00:00Z'), C);
  const dias = Object.keys(e.componentes.a.dias).sort();
  assert.deepEqual(dias, ['2026-08-19', '2026-11-16']);
  assert.equal(DIAS_GUARDADOS, 90);
});

test('um componente novo entra sem histórico e sem partir os outros', () => {
  const e = atualizar(estadoVazio(), { a: true, b: true }, t('2026-11-16T10:00:00Z'), [
    ...C,
    { id: 'b', nome: 'B', descricao: '' },
  ]);
  assert.equal(e.componentes.b.estado, 'operacional');
});

test('grava no repositório quando o dia muda ou um estado muda, e só aí', () => {
  const base = atualizar(estadoVazio(), { a: true }, t('2026-11-16T10:00:00Z'), C);
  const mesmoDia = atualizar(base, { a: true }, t('2026-11-16T10:05:00Z'), C);
  assert.equal(mudouOSuficiente(base, mesmoDia), false);
  const aConfirmar = atualizar(base, { a: false }, t('2026-11-16T10:05:00Z'), C);
  assert.equal(mudouOSuficiente(base, aConfirmar), true);
  const diaSeguinte = atualizar(base, { a: true }, t('2026-11-17T00:01:00Z'), C);
  assert.equal(mudouOSuficiente(base, diaSeguinte), true);
  assert.equal(mudouOSuficiente(null, base), true);
  assert.equal(mudouOSuficiente(estadoVazio(), base), true);
});

test('entre o repositório e a página publicada, fica o histórico mais recente', () => {
  const velho = { ultimaVerificacao: '2026-11-16T10:00:00.000Z' };
  const novo = { ultimaVerificacao: '2026-11-16T10:05:00.000Z' };
  assert.equal(maisRecente(velho, novo), novo);
  assert.equal(maisRecente(novo, velho), novo);
  assert.equal(maisRecente(velho, null), velho);
  assert.equal(maisRecente(null, novo), novo);
  assert.equal(maisRecente(null, null), null);
});

test('o dia é contado em UTC', () => {
  assert.equal(diaDe(t('2026-11-16T23:59:59Z')), '2026-11-16');
});
