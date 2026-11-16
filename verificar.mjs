// Verificador da página de estado da Veritud.
//
// Corre no GitHub Actions de 5 em 5 minutos (aproximadamente), FORA da
// infraestrutura da Veritud: pede cada endereço público, atualiza o histórico
// e escreve `site/estado.json`, que a página lê.
//
// Sem dependências: só o Node que já vem nos runners.
// Sem dados pessoais: só «respondeu / não respondeu» por serviço e por dia.

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const COMPONENTES = [
  {
    id: 'canal',
    nome: 'Canal de denúncias',
    descricao: 'Portal onde se apresenta e se acompanha uma denúncia',
    url: 'https://veritud.com/t/demo',
  },
  {
    id: 'plataforma',
    nome: 'Plataforma',
    descricao: 'Área reservada das organizações e serviços da aplicação',
    url: 'https://veritud.com/healthz',
  },
  {
    id: 'site',
    nome: 'Website',
    descricao: 'www.veritud.com',
    url: 'https://www.veritud.com/',
  },
];

export const DIAS_GUARDADOS = 90;
// Uma falha isolada pode ser do runner ou da rede dele. Só se dá um serviço
// por «em baixo» à segunda verificação falhada seguida (runners diferentes).
export const FALHAS_PARA_CONFIRMAR = 2;

const TEMPO_LIMITE_MS = 10_000;
const TENTATIVAS = 2;
const PAUSA_ENTRE_TENTATIVAS_MS = 5_000;

export function estadoVazio() {
  return { versao: 1, ultimaVerificacao: null, componentes: {} };
}

export function diaDe(agora) {
  return agora.toISOString().slice(0, 10); // dia em UTC
}

function estadoDe(falhasSeguidas) {
  if (falhasSeguidas === 0) return 'operacional';
  if (falhasSeguidas < FALHAS_PARA_CONFIRMAR) return 'a-confirmar';
  return 'em-baixo';
}

/**
 * Junta os resultados de uma volta ao histórico. Função pura: não lê relógio
 * nem rede. `resultados` = { [id]: true | false }.
 */
export function atualizar(anterior, resultados, agora, componentes = COMPONENTES) {
  const hoje = diaDe(agora);
  const limite = new Date(agora.getTime() - (DIAS_GUARDADOS - 1) * 86_400_000);
  const primeiroDia = diaDe(limite);
  const novo = { versao: 1, ultimaVerificacao: agora.toISOString(), componentes: {} };

  for (const c of componentes) {
    const antes = anterior?.componentes?.[c.id] ?? { falhasSeguidas: 0, dias: {} };
    const ok = resultados[c.id] === true;
    const falhasSeguidas = ok ? 0 : (antes.falhasSeguidas ?? 0) + 1;

    const dias = {};
    for (const [dia, valores] of Object.entries(antes.dias ?? {})) {
      if (dia >= primeiroDia && dia <= hoje) dias[dia] = { ...valores };
    }
    const d = dias[hoje] ?? { verificacoes: 0, falhas: 0, confirmadas: 0 };
    d.verificacoes += 1;
    if (!ok) d.falhas += 1;
    if (falhasSeguidas >= FALHAS_PARA_CONFIRMAR) {
      // Ao confirmar, a primeira falha da série também passa a contar.
      d.confirmadas += falhasSeguidas === FALHAS_PARA_CONFIRMAR ? FALHAS_PARA_CONFIRMAR : 1;
      d.confirmadas = Math.min(d.confirmadas, d.verificacoes);
    }
    dias[hoje] = d;

    novo.componentes[c.id] = {
      nome: c.nome,
      descricao: c.descricao,
      estado: estadoDe(falhasSeguidas),
      falhasSeguidas,
      dias,
    };
  }
  return novo;
}

/** Vale a pena gravar no repositório? Só quando o dia muda ou um estado muda. */
export function mudouOSuficiente(noRepositorio, novo) {
  if (!noRepositorio?.ultimaVerificacao) return true;
  if (diaDe(new Date(noRepositorio.ultimaVerificacao)) !== diaDe(new Date(novo.ultimaVerificacao))) return true;
  for (const [id, c] of Object.entries(novo.componentes)) {
    if (noRepositorio.componentes?.[id]?.estado !== c.estado) return true;
  }
  return false;
}

/** Entre dois históricos, fica o mais recente. */
export function maisRecente(a, b) {
  const ta = a?.ultimaVerificacao ? Date.parse(a.ultimaVerificacao) : 0;
  const tb = b?.ultimaVerificacao ? Date.parse(b.ultimaVerificacao) : 0;
  return tb > ta ? b : a;
}

async function responde(url) {
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    try {
      const r = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        headers: { 'user-agent': 'veritud-estado/1 (+https://www.veritud.com)' },
      });
      if (r.status >= 200 && r.status < 400) return true;
      console.log(`${url}: HTTP ${r.status} (tentativa ${tentativa})`);
    } catch (erro) {
      console.log(`${url}: ${erro.name} (tentativa ${tentativa})`);
    }
    if (tentativa < TENTATIVAS) await new Promise((r) => setTimeout(r, PAUSA_ENTRE_TENTATIVAS_MS));
  }
  return false;
}

async function lerJson(caminho) {
  try {
    return JSON.parse(await readFile(caminho, 'utf8'));
  } catch {
    return null;
  }
}

async function lerPublicado(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TEMPO_LIMITE_MS), cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function principal() {
  const noRepositorio = await lerJson('dados/historico.json');
  // Entre gravações no repositório, o histórico vive na página publicada.
  const publicado = await lerPublicado(process.env.ESTADO_PUBLICADO_URL);
  const anterior = maisRecente(noRepositorio, publicado) ?? estadoVazio();

  const resultados = {};
  await Promise.all(
    COMPONENTES.map(async (c) => {
      resultados[c.id] = await responde(c.url);
    }),
  );

  const novo = atualizar(anterior, resultados, new Date());
  const texto = `${JSON.stringify(novo)}\n`;
  await writeFile('site/estado.json', texto);

  const gravar = mudouOSuficiente(noRepositorio, novo);
  if (gravar) await writeFile('dados/historico.json', texto);
  if (process.env.GITHUB_OUTPUT) {
    await writeFile(process.env.GITHUB_OUTPUT, `gravar=${gravar}\n`, { flag: 'a' });
  }
  for (const [id, c] of Object.entries(novo.componentes)) console.log(`${id}: ${c.estado}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await principal();
}
