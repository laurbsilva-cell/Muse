/* muse. — configuração por ambiente.
   Este arquivo é público. Só coloque aqui o que pode ser exposto no navegador.

   A chave publishable/anon do Supabase é feita para uso no cliente. A segurança
   dos dados depende do RLS no banco e das policies por user_id.
   NUNCA coloque aqui service_role, senha do banco ou qualquer chave privada.
*/
window.MUSE_CONFIG = {
  SUPABASE_URL: "https://imtbtgyzviknrvkwylfv.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_o_m5ZdL6tcCJSPrXnumh2w_oh00pMEJ",
  SYNC_INTERVALO: 60000
};

/* Camada v2 de sincronização entre aparelhos.
   Carrega cedo, mas só inicia depois que o DOM e o fluxo base de autenticação
   estiverem prontos. Assim não exige alterar o app.html nem refazer o login. */
(function carregarSyncV2() {
  if (document.querySelector('script[data-muse-sync-v2]')) return;
  const s = document.createElement("script");
  s.src = "sync-v2.js";
  s.dataset.museSyncV2 = "1";
  document.head.appendChild(s);
})();
