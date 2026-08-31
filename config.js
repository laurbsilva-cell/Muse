/* muse. — configuração por ambiente.
   Este arquivo é público (vai para o GitHub Pages). Só entre aqui o que pode ser público.

   A chave anon do Supabase é publicável por definição: ela não dá acesso a nada
   sozinha, porque o banco tem RLS ligado e toda policy compara auth.uid() com user_id.
   NUNCA cole aqui a service_role, senha de banco, ou qualquer chave privada.

   Enquanto os dois campos estiverem vazios, o muse. funciona 100% local:
   nenhuma requisição sai do aparelho e a biblioteca do Supabase nem é baixada.

   Para ligar a nuvem:
   1. crie um projeto em supabase.com
   2. rode supabase/schema.sql no SQL Editor
   3. Authentication → Providers → Google: ligue e configure o OAuth
   4. Authentication → URL Configuration → Redirect URLs: adicione a URL do seu site
   5. cole abaixo Project URL e a chave anon (Settings → API)
*/
window.MUSE_CONFIG = {
  SUPABASE_URL: "https://imtbtgyzviknrvkwylfv.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_o_m5ZdL6tcCJSPrXnumh2w_oh00pMEJ",
  /* de quanto em quanto tempo tentar sincronizar em segundo plano (ms) */
  SYNC_INTERVALO: 60000
};

/*
  Correção do retorno do OAuth no PWA.
  app.html monta a tela de entrada antes de nuvem.js terminar de recuperar a sessão.
  Depois que o Supabase confirma o usuário, reconciliamos a tela sem pedir um segundo login.
*/
(function corrigirRetornoGoogle() {
  let tentativas = 0;
  const MAX_TENTATIVAS = 80;

  function reconciliar() {
    const N = window.Nuvem;

    if (N && N.usuario) {
      const conta = document.getElementById("onbConta");
      const onb = document.getElementById("onb");
      const app = document.getElementById("app");

      if (typeof S !== "undefined" && S.perfil) {
        const appJaVisivel = app && !app.classList.contains("hide");
        if (conta) conta.classList.add("hide");
        if (onb) onb.classList.add("hide");
        if (app) app.classList.remove("hide");
        if (!appJaVisivel && typeof iniciarApp === "function") iniciarApp();
      } else {
        if (conta) conta.classList.add("hide");
        if (typeof abrirOnb === "function") abrirOnb();
      }
      return;
    }

    tentativas += 1;
    if (tentativas < MAX_TENTATIVAS) setTimeout(reconciliar, 250);
  }

  if (document.readyState === "complete") setTimeout(reconciliar, 0);
  else addEventListener("load", () => setTimeout(reconciliar, 0), { once: true });
})();
