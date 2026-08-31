# muse. — arquitetura e decisões

Documento curto, mantido junto do código. Atualizar quando uma decisão mudar.

## Estado real (auditado em 2026-08-24)

| Camada | O que é |
|---|---|
| Stack | HTML/CSS/JS sem framework, sem build step, sem gerenciador de pacotes |
| Arquivos | `index.html` (landing), `app.html` (produto), `privacidade.html`, `sw.js`, `manifest.json` |
| Persistência | `localStorage`, chave `minhabase.v1`, objeto único `S` |
| Autenticação | **não existe** — sem conta, sem servidor, sem sincronização |
| Deploy | GitHub Pages, caminho relativo (`./`), sem base path |
| Testes | `teste.js` (Node puro, sem dependências) — `node teste.js` |

Por que continua vanilla: o app roda inteiro de um arquivo, offline, sem build.
Migrar para framework hoje custaria a simplicidade de deploy sem resolver
nenhum problema que exista de fato. A decisão se revisita quando houver backend.

## Esquema de dados

`ESQUEMA = 3`. Toda alteração de formato passa por `migrar(d)`, que:

1. grava `minhabase.v1.backup.v<N>` **antes** de tocar em qualquer coisa;
2. aplica só as transformações da versão em questão;
3. é idempotente — rodar duas vezes não muda nada.

`carregar()` usa `mesclar()` (merge profundo) contra `VAZIO`, então campo novo
do esquema entra sem apagar o que já estava salvo. Arrays são substituídos
inteiros, nunca mesclados item a item.

### v1 → v2
Adicionou `modulos`, `sono`, `caos`, `cfg.tema`, `rotina.pulados`, `rotina.adiados`.
Quem já tinha medicamento cadastrado teve o módulo `meds` ligado automaticamente.

### v2 → v3
Adicionou `ativ`, `compras`, `cabelo`, `alim.barcode` e `perfil.estrategiaGasto`.
Gastos antigos ganharam `id` e `parc: null`. Nenhum campo foi removido ou renomeado.
Quem vem da v1 migra direto para a v3 numa chamada só, com um único backup do original.

## Tokens

`:root` tem paleta base + aliases semânticos (`--primary`, `--surface`,
`--textPrimary`, `--hydration`, `--positive`, `--warning`, `--danger`…),
espaçamento, raio, movimento, camadas e `--toque: 44px`.

`html[data-tema="escuro"]` redefine só a paleta base — os componentes não
sabem qual tema está ativo. Um script inline no `<head>` aplica o tema antes
da primeira pintura, lendo o `localStorage` direto: sem flash.

Nenhum hex cru sobrou no CSS de componentes (verificado por teste estático).

## Cores têm significado

água → `--azul` · economia → `--verde` · meta → `--ocre` ·
marca/interação → `--roxo` · atenção → `--terra`.

Terracota só aparece em saldo negativo e ação destrutiva. Nunca em gasto comum.

## Energia: três contas separadas

1. **TMB** — Mifflin-St Jeor (1990).
2. **GET** — TMB × fator de atividade declarado.
3. **Gasto de uma atividade** — `MET × 3,5 × peso / 200 × minutos` (gasto bruto),
   METs do [Compendium of Physical Activities 2024](https://pacompendium.com/).

`perfil.estrategiaGasto` decide se (3) entra no total do dia:

- `"fator"` (padrão): o GET já embute treino no fator, então a atividade é
  registrada e **não** somada. O app diz isso na tela.
- `"baseline"`: o GET usa fator sedentário e as atividades somam por cima.

Sem essa chave explícita não há como evitar dupla contagem — é o motivo dela existir.

## Fontes externas

| Fonte | Uso | Adaptador |
|---|---|---|
| TACO 4ª ed. | alimentos brasileiros genéricos | embutida, `TACO_FONTE` |
| Open Food Facts | produtos por código de barras | `buscarOFF()` normaliza; a UI nunca vê o JSON deles |
| Compendium 2024 | METs | tabela `METS`, `MET_FONTE` |

Nutriente ausente na fonte é `null` e aparece como "não informado". O painel de
nutrientes marca total incompleto com `+` e diz quantos itens têm o dado.

A API do Open Food Facts pede identificação por `User-Agent`; o navegador não
deixa a página definir esse cabeçalho, então isso está documentado no código
em vez de simulado.

## Limites assumidos

- **Notificações**: agendadas com `setTimeout` na página. Funcionam com o app
  aberto ou recém-fechado; **não são alarme confiável**. Push real exige
  servidor — está na Fase 8. O corpo da notificação de medicamento não cita o
  nome do remédio (tela bloqueada).
- **Privacidade**: `localStorage` não é criptografado. Quem tem o aparelho
  desbloqueado tem os dados. Isso está dito na política.
- **RLS / isolamento entre contas**: não se aplica hoje — não há contas.

## Nuvem (fase 8)

Três arquivos novos, todos opcionais:

- `config.js` — placeholders públicos. Vazio = app 100% local, sem baixar nada.
- `nuvem.js` — conta, sincronização e fila offline. Dormente sem configuração.
- `supabase/schema.sql` — 27 tabelas, RLS forçado em todas, dinheiro em centavos.

A sincronização é dirigida por um **mapa declarativo** (`MAPA` em `nuvem.js`):
uma entrada por tabela, com `ler(S)` e `gravar(S, linhas)`. Adicionar um domínio
novo é acrescentar uma entrada, não escrever mais um caminho de sync.

Registros que não tinham id próprio (marcações por dia) recebem um uuid
determinístico via `hashId()`, derivado do conteúdo. Reenviar a mesma marcação
nunca duplica linha — é o que torna a fila offline idempotente.

Conflito: última escrita vence, por registro. Documentado, não escondido.

## O que falta

**Push com o app fechado.** Exige servidor com chaves VAPID e agendador. O app
detecta suporte, oferece alternativa dentro dele e diz na tela que lembrete
agendado no aparelho não é alarme. Nada é prometido a mais.

**Revisão jurídica** antes de qualquer lançamento público — ver `SEGURANCA.md`.

## Amostra mínima dos insights

`AMOSTRA_MIN = 5`. Nenhuma observação aparece sem base suficiente, e toda
observação declara período, quantidade de registros e que é comparação entre
registros — nunca relação de causa. Testado em `teste.js`.
