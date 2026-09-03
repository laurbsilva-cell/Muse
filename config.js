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

/* Camada v3 de sincronização entre aparelhos.
   Carrega cedo, espera a autenticação base terminar e usa a infraestrutura de
   nuvem que já existe no projeto antes de assumir a sincronização. */
(function carregarSyncV3() {
  if (document.querySelector('script[data-muse-sync-v3]')) return;
  const s = document.createElement("script");
  s.src = "sync-v3.js";
  s.dataset.museSyncV3 = "1";
  document.head.appendChild(s);
})();