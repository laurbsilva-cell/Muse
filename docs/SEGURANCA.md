# muse. — modelo de ameaça e limites

Documento honesto sobre o que o app protege e o que ele **não** protege.

## Sem conta (padrão)

Tudo em `localStorage`, neste aparelho. Isso significa:

| Ameaça | Situação |
|---|---|
| Vazamento de servidor | Não existe servidor. Impossível. |
| Interceptação de rede | Nada trafega, exceto código de barras (só o número do GTIN). |
| Quem tem o aparelho desbloqueado | **Lê tudo.** `localStorage` não é criptografado. |
| Extensão de navegador maliciosa | **Lê tudo.** Mesmo origem, mesmo acesso. |
| Limpar dados do navegador | Apaga tudo. O backup exportado é a única cópia. |

## Com conta ligada

**Autorização mora no banco, não no frontend.** Toda tabela tem `user_id`, RLS
ligado e `force row level security`, com policy nas quatro operações comparando
`auth.uid() = user_id`. O cliente pode mandar qualquer id que quiser: o Postgres
recusa.

A chave anon é publicável de propósito — sem sessão válida ela não lê nada.
A `service_role` nunca aparece no repositório e nunca deve.

**Teste negativo obrigatório antes de confiar:** o procedimento com duas contas
está em `NUVEM.md`, seção 4. Não pule.

## O que continua exposto

- **IndexedDB e localStorage não são criptografados.** A fila offline guarda as
  mudanças pendentes em claro até subirem.
- **Conteúdo sensível em cache**: o service worker guarda o shell do app, nunca
  resposta de API. Dado pessoal não entra em cache HTTP.
- **XSS**: todo texto de usuário passa por `esc()` antes de virar HTML. Não há
  `innerHTML` com entrada crua — vale conferir isso em qualquer código novo.
- **Logs**: `console.warn` registra só mensagem de erro técnico. Nunca diário,
  medicamento, valor financeiro ou token.

## Terceiros

| Serviço | O que recebe | Quando |
|---|---|---|
| Open Food Facts | o número do código de barras | só quando você escaneia ou digita um |
| Google (OAuth) | confirma sua identidade | só se você ligar a conta |
| Supabase | seus registros | só se você ligar a conta |
| GitHub Pages | IP e user-agent, como qualquer site | sempre que abre |

Nenhum analytics. Nenhum pixel. Nenhuma publicidade.

## LGPD — o que está feito e o que falta

Feito: minimização (nenhum campo pedido sem uso), política versionada, exportação
completa em JSON e CSV por módulo, exclusão por escopo e exclusão de conta que
apaga de fato (cascade no banco), aviso no contexto da coleta, sem dark pattern.

Falta: **revisão jurídica antes de lançamento público.** Nada aqui é parecer
legal. Se o muse. sair do uso pessoal, o inventário de dados, a base legal de
cada finalidade e o canal de titular precisam passar por advogado.

## Saúde

O módulo de bem-estar e o de medicamentos organizam registros. Não diagnosticam,
não interpretam sintoma, não sugerem iniciar, mudar ou parar tratamento. Ausência
de registro não vira "esquecido". O botão de ajuda leva a contatos escolhidos por
você e ao CVV (188).
