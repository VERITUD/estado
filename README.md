# Estado dos serviços da Veritud

Página pública com a disponibilidade do canal de denúncias, da plataforma e do
website da Veritud.

## Como funciona

- O workflow `verificar` corre no GitHub Actions de 5 em 5 minutos,
  aproximadamente. Pede cada endereço público por HTTPS, a partir de fora da
  infraestrutura da Veritud.
- Um serviço só aparece como indisponível depois de duas verificações falhadas
  seguidas, para uma falha de rede passageira não contar como avaria.
- O resultado vai para `site/estado.json` e a página (`site/`) é publicada no
  GitHub Pages. Fica alojada fora da plataforma, por isso continua disponível
  mesmo que a plataforma não esteja.
- O histórico (90 dias, uma linha por dia e por serviço) é gravado em
  `dados/historico.json` uma vez por dia e sempre que um estado muda. Entre
  gravações, vive na página publicada.

## O que este repositório não tem

Não tem código da plataforma, credenciais nem dados pessoais. Guarda só
«respondeu / não respondeu» por serviço e por dia. A página não usa cookies
nem ferramentas de medição. Está alojada no GitHub Pages, que, como qualquer
alojamento, recebe o endereço IP de quem a visita.

## Desenvolvimento

```bash
node --test
```

Não tem dependências: usa só o Node que vem nos runners.
