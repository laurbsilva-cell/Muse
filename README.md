<p align="center">
  <img src="logo.png" alt="muse." height="34">
</p>

<p align="center"><strong>sua vida, menos espalhada.</strong></p>

<p align="center">
Rotina, alimentação, dinheiro e bem-estar em um lugar só.<br>
Feito para dias reais, sem transformar a vida em planilha.
</p>

---

## O que é

Aplicativo pessoal de organização integrada. Reúne rotina, alimentação com base
TACO, hidratação, atividade física, finanças, bem-estar, medicamentos, sono,
lista de compras, cronograma capilar e progresso — cada módulo ligável e
desligável.

Roda como PWA: instala pela tela inicial do celular e funciona offline.

**Sem conta, os dados ficam só no aparelho.** Nenhum servidor, nenhum
rastreador, nenhuma publicidade. A sincronização em nuvem é opcional e precisa
ser configurada por você.

## Publicar no GitHub Pages

1. Crie um repositório público e envie todos estes arquivos na raiz.
2. Settings → Pages → Source: `Deploy from a branch`, branch `main`, pasta `/ (root)`.
3. Em poucos minutos o site sobe:

| Endereço | O que abre |
|---|---|
| `https://SEU-USUARIO.github.io/REPO/` | a landing page |
| `https://SEU-USUARIO.github.io/REPO/app.html` | o aplicativo |

O arquivo `.nojekyll` já está incluído — sem ele o GitHub Pages ignora alguns arquivos.

## Instalar no celular

**iPhone** — abra no Safari (só ele instala), toque em Compartilhar → Adicionar à
Tela de Início.
**Android** — abra no Chrome, menu ⋮ → Instalar aplicativo.

Detalhes em [`docs/COMO-INSTALAR.md`](docs/COMO-INSTALAR.md).

## Ligar conta e sincronização (opcional)

Enquanto `config.js` estiver vazio, o app não faz nenhuma requisição e nem baixa
a biblioteca do Supabase. Para ligar, siga [`docs/NUVEM.md`](docs/NUVEM.md) —
inclui o teste de isolamento entre duas contas, que **não é opcional**.

Resumo: criar projeto no Supabase → rodar `supabase/schema.sql` → configurar o
provider Google → colar URL e chave anon em `config.js`.

## Estrutura

```
index.html          landing page
app.html            o aplicativo inteiro (HTML + CSS + JS + base TACO)
privacidade.html    política de privacidade
config.js           configuração por ambiente — vazio = 100% local
nuvem.js            conta, sincronização e fila offline (dormente sem config)
sw.js               service worker: offline e atualização
manifest.json       PWA
teste.js            123 testes, sem dependências — rode com `node teste.js`
supabase/           schema.sql com as 27 tabelas e RLS
docs/               arquitetura, nuvem, segurança, instalação
marca/              arquivos originais da identidade
```

Sem build step, sem gerenciador de pacotes, sem dependência em runtime. Serve
direto.

## Testes

```bash
node teste.js
```

Cobrem migração de esquema com preservação de dados, cálculos de energia e MET,
parcelas, insights com amostra mínima, RLS declarado no schema, idempotência da
fila offline, acessibilidade e linguagem.

## Fontes de dados

| Fonte | Uso |
|---|---|
| [TACO 4ª ed. — NEPA/Unicamp](https://nepa.unicamp.br/tabela-brasileira-de-composicao-de-alimentos-4a-edicao/) | 591 alimentos brasileiros |
| [Open Food Facts](https://openfoodfacts.org) | produtos por código de barras |
| [Compendium of Physical Activities 2024](https://pacompendium.com/) | valores MET |

Valor ausente na fonte aparece como **não informado** — nunca é convertido em zero.

## Limites conhecidos

- Lembretes são agendados no aparelho: funcionam com o app aberto ou recém-fechado,
  **não são alarme**. Push com o app fechado exige servidor.
- `localStorage` e `IndexedDB` não são criptografados.
- A camada de nuvem ainda não foi executada contra um Supabase real.

Detalhes em [`docs/SEGURANCA.md`](docs/SEGURANCA.md).

## Marca

muse. escreve-se sempre em minúsculas e com ponto final. Roxo `#783A8A`,
creme `#F3F1EC`, lilás `#B98FCB`, areia `#F8DEB0`, azul `#8EB6DB`,
verde `#97C4A5`, terracota `#B4483C`.

Código público para hospedagem. A marca não está licenciada para terceiros — ver
[`LICENSE`](LICENSE).
