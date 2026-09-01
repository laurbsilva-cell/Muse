/* muse. — configuração por ambiente.
   Este arquivo é público. Só coloque aqui o que pode ser exposto no navegador.

   A chave publishable/anon do Supabase é feita para uso no cliente. A segurança
   dos dados depende do RLS no banco e das policies por user_id.
   NUNCA coloque aqui service_role, senha do banco ou qualquer chave privada.

   Conta e sincronização são controladas exclusivamente por nuvem.js.
   Manter uma única lógica de inicialização evita disputa entre as telas de
   login, onboarding e aplicativo enquanto a sessão OAuth é recuperada.
*/
window.MUSE_CONFIG = {
  SUPABASE_URL: "https://imtbtgyzviknrvkwylfv.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_o_m5ZdL6tcCJSPrXnumh2w_oh00pMEJ",
  /* intervalo da sincronização em segundo plano (ms) */
  SYNC_INTERVALO: 60000
};
