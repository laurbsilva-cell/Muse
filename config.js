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
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  /* de quanto em quanto tempo tentar sincronizar em segundo plano (ms) */
  SYNC_INTERVALO: 60000
};
