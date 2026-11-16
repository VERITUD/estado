// Página de estado da Veritud: lê estado.json e desenha. Sem cookies, sem
// pedidos a terceiros, sem dados de quem visita.
(() => {
  'use strict';

  const DIAS = 90;
  const DIAS_ECRA_ESTREITO = 30;
  const SEM_NOTICIAS_MIN = 45; // o agendamento do GitHub atrasa; acima disto avisamos
  const ORDEM = ['canal', 'plataforma', 'site'];

  const ROTULO = {
    operacional: ['Operacional', 'etiqueta-ok'],
    'a-confirmar': ['A confirmar', 'etiqueta-aviso'],
    'em-baixo': ['Indisponível', 'etiqueta-mau'],
  };

  const el = (tag, classe, texto) => {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  };

  const diaIso = (d) => d.toISOString().slice(0, 10);
  const dataLonga = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const horaCurta = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const percento = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function ultimosDias(agora) {
    const dias = [];
    for (let i = DIAS - 1; i >= 0; i -= 1) dias.push(diaIso(new Date(agora.getTime() - i * 86400000)));
    return dias;
  }

  function classeDoDia(v) {
    if (!v || !v.verificacoes) return 'dia-vazio';
    if (!v.confirmadas) return 'dia-ok';
    return v.confirmadas / v.verificacoes > 0.05 ? 'dia-mau' : 'dia-parcial';
  }

  function textoDoDia(dia, v) {
    const quando = dataLonga.format(new Date(`${dia}T12:00:00Z`));
    if (!v || !v.verificacoes) return `${quando}: sem dados`;
    if (!v.confirmadas) return `${quando}: sem falhas`;
    const disp = 100 * (1 - v.confirmadas / v.verificacoes);
    return `${quando}: ${percento.format(disp)} % disponível`;
  }

  function disponibilidade(dias, lista) {
    let total = 0;
    let falhas = 0;
    for (const d of lista) {
      const v = dias[d];
      if (v && v.verificacoes) {
        total += v.verificacoes;
        falhas += v.confirmadas || 0;
      }
    }
    return total ? 100 * (1 - falhas / total) : null;
  }

  function desenharServico(c, lista) {
    const li = el('li', 'servico');
    const cabeca = el('div', 'servico-cabeca');
    const nomes = el('div');
    nomes.append(el('h3', 'servico-nome', c.nome), el('p', 'servico-descricao', c.descricao));
    const [rotulo, classe] = ROTULO[c.estado] || ['Sem dados', 'etiqueta-vazio'];
    cabeca.append(nomes, el('span', `etiqueta ${classe}`, rotulo));

    const disp90 = disponibilidade(c.dias || {}, lista);
    const disp30 = disponibilidade(c.dias || {}, lista.slice(-DIAS_ECRA_ESTREITO));
    const texto = (v) => (v == null ? 'sem dados' : `${percento.format(v)} % disponível`);

    const barras = el('div', 'barras');
    barras.setAttribute('role', 'img');
    barras.setAttribute('aria-label', `${c.nome}: ${texto(disp90)} nos últimos ${DIAS} dias`);
    for (const d of lista) {
      const b = el('span', `barra ${classeDoDia((c.dias || {})[d])}`);
      b.title = textoDoDia(d, (c.dias || {})[d]);
      barras.append(b);
    }

    const pe = el('div', 'barras-pe');
    const inicio = el('span');
    inicio.append(el('span', 'janela-longa', `há ${DIAS} dias`), el('span', 'janela-curta', `há ${DIAS_ECRA_ESTREITO} dias`));
    const meio = el('span');
    const longa = el('strong', 'janela-longa', texto(disp90));
    const curta = el('strong', 'janela-curta', texto(disp30));
    meio.append(longa, curta);
    pe.append(inicio, meio, el('span', null, 'hoje'));

    li.append(cabeca, barras, pe);
    return li;
  }

  function ha(minutos) {
    if (minutos < 1) return 'há menos de um minuto';
    if (minutos < 60) return `há ${minutos} min`;
    const h = Math.floor(minutos / 60);
    return h === 1 ? 'há mais de 1 hora' : `há mais de ${h} horas`;
  }

  function desenharResumo(estado, agora) {
    const resumo = document.getElementById('resumo');
    const titulo = document.getElementById('resumo-titulo');
    const quando = document.getElementById('resumo-quando');
    const componentes = Object.values(estado.componentes || {});
    const ultima = estado.ultimaVerificacao ? new Date(estado.ultimaVerificacao) : null;
    const minutos = ultima ? Math.floor((agora - ultima) / 60000) : null;

    let classe = 'resumo-ok';
    let texto = 'Todos os serviços estão operacionais';
    const emBaixo = componentes.filter((c) => c.estado === 'em-baixo');
    const aConfirmar = componentes.filter((c) => c.estado === 'a-confirmar');

    if (!ultima || !componentes.length) {
      classe = 'resumo-espera';
      texto = 'Ainda não há verificações registadas';
    } else if (minutos > SEM_NOTICIAS_MIN) {
      classe = 'resumo-espera';
      texto = 'Sem verificações recentes';
    } else if (emBaixo.length === componentes.length) {
      classe = 'resumo-mau';
      texto = 'Os serviços estão indisponíveis';
    } else if (emBaixo.length) {
      classe = 'resumo-mau';
      texto = emBaixo.length === 1 ? `${emBaixo[0].nome}: serviço indisponível` : 'Alguns serviços estão indisponíveis';
    } else if (aConfirmar.length) {
      classe = 'resumo-aviso';
      texto = 'Uma verificação falhou; a confirmar na próxima';
    }

    resumo.className = `resumo ${classe}`;
    titulo.textContent = texto;
    if (!ultima) {
      quando.textContent = 'A primeira verificação aparece aqui dentro de minutos.';
    } else if (minutos > SEM_NOTICIAS_MIN) {
      quando.textContent = `A última verificação foi ${ha(minutos)}. O estado mostrado pode estar desatualizado.`;
    } else {
      quando.textContent = `Última verificação ${ha(minutos)} (${horaCurta.format(ultima)}, hora do seu dispositivo).`;
    }
  }

  function desenhar(estado) {
    const agora = new Date();
    desenharResumo(estado, agora);
    const lista = ultimosDias(agora);
    const ul = document.getElementById('servicos');
    const componentes = estado.componentes || {};
    const ids = [...ORDEM.filter((id) => componentes[id]), ...Object.keys(componentes).filter((id) => !ORDEM.includes(id))];
    ul.replaceChildren(...ids.map((id) => desenharServico(componentes[id], lista)));
  }

  function falhou() {
    document.getElementById('resumo').className = 'resumo resumo-espera';
    document.getElementById('resumo-titulo').textContent = 'Não foi possível carregar o estado';
    document.getElementById('resumo-quando').textContent = 'Tente recarregar a página dentro de momentos.';
  }

  let ultimoBom = null;

  async function carregar() {
    try {
      const r = await fetch(`estado.json?t=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      ultimoBom = await r.json();
      desenhar(ultimoBom);
    } catch {
      if (ultimoBom) desenhar(ultimoBom);
      else falhou();
    }
  }

  carregar();
  setInterval(carregar, 60000);
})();
