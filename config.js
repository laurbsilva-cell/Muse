/* muse. — configuração por ambiente.
   Este arquivo é público. Só coloque aqui o que pode ser exposto no navegador.

   A chave publishable/anon do Supabase é feita para uso no cliente. A segurança
   dos dados depende do RLS no banco e das policies por user_id.
   NUNCA coloque aqui service_role, senha do banco ou qualquer chave privada.
*/

/* Compatibilidade temporária para versões do app cujo mesclar() ainda trata
   `null` como objeto. O app clona VAZIO duas vezes no boot: a primeira cria S;
   a segunda é a base usada para carregar o estado salvo. Só nessa segunda cópia
   removemos chaves nulas da BASE, fazendo o mesclar legado receber a estrutura
   real do usuário sem cair em Object.keys(null). Depois restauramos JSON.parse /
   JSON.stringify imediatamente, então o restante do app continua nativo. */
(function protegerBootContraNull() {
  const parseNativo = JSON.parse.bind(JSON);
  const stringifyNativo = JSON.stringify.bind(JSON);
  let copiasDoVazio = 0;
  let alvoPendente = false;
  let restaurado = false;

  function pareceVazioMuse(v) {
    return !!(v && typeof v === "object" && v.perfil === null && v.modulos && v.rotina && v.alim && v.cfg && v.cabelo && v.fin);
  }

  function removerNulosDaBase(v) {
    if (Array.isArray(v)) return v.map(removerNulosDaBase);
    if (!v || typeof v !== "object") return v;
    const r = {};
    for (const [k, valor] of Object.entries(v)) {
      if (valor === null) continue;
      r[k] = removerNulosDaBase(valor);
    }
    return r;
  }

  function restaurar() {
    if (restaurado) return;
    JSON.parse = parseNativo;
    JSON.stringify = stringifyNativo;
    restaurado = true;
  }

  JSON.stringify = function (value, replacer, space) {
    if (!restaurado && pareceVazioMuse(value)) {
      copiasDoVazio += 1;
      if (copiasDoVazio === 2) alvoPendente = true;
    }
    return stringifyNativo(value, replacer, space);
  };

  JSON.parse = function (text, reviver) {
    const valor = parseNativo(text, reviver);
    if (!restaurado && alvoPendente) {
      alvoPendente = false;
      const seguro = removerNulosDaBase(valor);
      restaurar();
      return seguro;
    }
    return valor;
  };

  addEventListener("DOMContentLoaded", () => setTimeout(restaurar, 0), { once: true });
})();

window.MUSE_CONFIG = {
  SUPABASE_URL: "https://imtbtgyzviknrvkwylfv.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_o_m5ZdL6tcCJSPrXnumh2w_oh00pMEJ",
  SYNC_INTERVALO: 60000
};

/* A sincronização precisa registrar seu boot antes de nuvem.js. Enquanto este
   config.js está sendo executado pelo parser, document.write insere o script de
   forma bloqueante e elimina a corrida que existia nas versões v3/v4. */
(function carregarSyncV5Deterministico() {
  const src = "sync-v5.js?v=20260904-2";
  if (document.readyState === "loading") {
    document.write('<script src="' + src + '" data-muse-sync-v5="1"><\\/script>');
    return;
  }
  if (document.querySelector('script[data-muse-sync-v5]')) return;
  const s = document.createElement("script");
  s.src = src;
  s.async = false;
  s.dataset.museSyncV5 = "1";
  document.head.appendChild(s);
})();