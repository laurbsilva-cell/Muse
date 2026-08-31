# muse. — ligar conta e sincronização

Enquanto `config.js` estiver vazio, o app roda 100% local: nenhuma requisição sai
do aparelho e a biblioteca do Supabase nem é baixada. Ligar a nuvem é opcional.

## 1. Criar o projeto
1. Crie um projeto em supabase.com (o plano gratuito serve).
2. SQL Editor → cole `supabase/schema.sql` inteiro → Run. É idempotente.
3. Confira em Table Editor que todas as tabelas aparecem com **RLS enabled**.

## 2. Login com Google
1. Google Cloud Console → APIs e Serviços → Credenciais → ID do cliente OAuth (Web).
2. Em *Authorized redirect URIs*, cole a URL que o Supabase mostra em
   Authentication → Providers → Google.
3. No Supabase, ligue o provider Google e cole Client ID e Secret.
4. Authentication → URL Configuration → Redirect URLs: adicione
   `https://SEU-USUARIO.github.io/Muse/app.html`.

Escopos: apenas `openid`, `email`, `profile`. O Google confirma quem você é —
não recebe nem acessa nada do que está dentro do muse.

## 3. Preencher config.js
Settings → API. Copie **Project URL** e a chave **anon public**.

```js
window.MUSE_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ...",
  SYNC_INTERVALO: 60000
};
```

A chave anon é publicável: ela não abre nada sozinha, porque toda tabela tem RLS
e toda policy compara `auth.uid()` com `user_id`. **Nunca** cole aqui a
`service_role` nem a senha do banco.

## 4. Testar o isolamento antes de confiar
Este teste não é opcional. Faça com duas contas Google diferentes:

1. Entre com a conta A, registre alguma coisa, sincronize.
2. No SQL Editor, rode `select id, user_id from public.transacoes;` e copie um id.
3. Saia, entre com a conta B e abra o console do navegador:
   ```js
   const c = await import("https://esm.sh/@supabase/supabase-js@2");
   const s = c.createClient(MUSE_CONFIG.SUPABASE_URL, MUSE_CONFIG.SUPABASE_ANON_KEY);
   await s.from("transacoes").select("*").eq("id", "ID-DA-CONTA-A");
   ```
   O resultado tem que vir vazio. Tente também `update` e `delete` no mesmo id:
   as duas precisam falhar ou afetar zero linhas.
4. Repita para `itens_refeicao`, `registros_humor` e `medicamentos` — as tabelas
   mais sensíveis.

Se qualquer uma devolver dado da outra conta, **pare** e confira se o `schema.sql`
rodou inteiro: o bloco final é o que liga RLS em todas as tabelas.

## Como a sincronização se comporta

- **Conflito**: última escrita vence, por registro. Registros têm id estável
  (gerado no cliente), então reenviar nunca duplica.
- **Offline**: as mudanças ficam numa fila em IndexedDB e sobem sozinhas quando
  a conexão volta. A chave da fila é `tabela:id`, então reenviar substitui em vez
  de acumular.
- **Trocar de conta**: recarrega o app e limpa a fila, para cache de uma conta
  nunca aparecer na outra.
- **Sair**: você escolhe deixar ou limpar a cópia local. Em aparelho compartilhado,
  limpe.
- **IndexedDB e localStorage não são criptografados.** Quem tem o aparelho
  desbloqueado tem os dados. Isso está dito na política de privacidade.

## O que continua sem servidor

Notificação com o app fechado. Os lembretes são agendados no aparelho e valem
enquanto o muse. está aberto ou recém-fechado — o app diz isso na tela e sugere
o despertador do celular para o que não pode falhar. Push confiável exige um
servidor com chaves VAPID e um agendador; é o próximo passo depois desta fase.
