/* muse. — sincronização v2
   Um estado canônico por conta, armazenado em cache_codigo_barras.produto (JSONB).
   Não exige migração SQL: usa uma tabela pessoal já protegida por RLS.

   Objetivos:
   - ao entrar em qualquer aparelho, a nuvem é a fonte oficial;
   - toda alteração local sobe rapidamente;
   - exclusões persistem (snapshot completo, não apenas upsert de linhas existentes);
   - outros aparelhos percebem mudanças por uma revisão leve e atualizam;
   - offline continua salvando localmente e envia quando a conexão volta.
*/
"use strict";
(function () {
  const C = window.MUSE_CONFIG || {};
  if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) return;

  const CDN = "https://esm.sh/@supabase/supabase-js@2";
  const BASE_KEY = typeof CHAVE !== "undefined" ? CHAVE : "minhabase.v1";
  const REV_KEY = BASE_KEY + ".cloud-v2-rev";
  const UPDATED_KEY = BASE_KEY + ".cloud-v2-updated";
  const GTIN = "__muse_state_v2__";

  let client = null;
  let session = null;
  let applyingRemote = false;
  let dirty = false;
  let syncing = false;
  let initialized = false;
  let saveTimer = null;
  let pollTimer = null;
  let lastRev = localStorage.getItem(REV_KEY) || "";
  let lastServerUpdated = localStorage.getItem(UPDATED_KEY) || "";
  let originalCloudDownload = null;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clone = o => JSON.parse(JSON.stringify(o));

  async function getClient() {
    if (client) return client;
    const { createClient } = await import(CDN);
    client = createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  function rowId(uid) { return "muse-state-v2:" + uid; }

  function cleanSnapshot() {
    const snap = clone(S);
    // Reserva para metadados futuros sem deixar a sincronização se auto-embutir.
    if (snap.modulos && snap.modulos.__muse_sync) delete snap.modulos.__muse_sync;
    return snap;
  }

  function makePayload() {
    return {
      version: 2,
      rev: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10),
      saved_at: new Date().toISOString(),
      snapshot: cleanSnapshot()
    };
  }

  async function readRow(metaOnly) {
    if (!session) return null;
    const c = await getClient();
    const cols = metaOnly ? "atualizado_em" : "produto,atualizado_em";
    const { data, error } = await c.from("cache_codigo_barras")
      .select(cols)
      .eq("user_id", session.user.id)
      .eq("gtin", GTIN)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  function persistMeta(payload, updated) {
    if (payload && payload.rev) {
      lastRev = payload.rev;
      localStorage.setItem(REV_KEY, lastRev);
    }
    if (updated) {
      lastServerUpdated = updated;
      localStorage.setItem(UPDATED_KEY, updated);
    }
  }

  function persistLocalWithoutDirty() {
    applyingRemote = true;
    try {
      // chama a implementação local original através do wrapper atual;
      // o flag impede esta camada de marcar o download como alteração do usuário.
      window.salvar();
    } finally {
      applyingRemote = false;
    }
  }

  function refreshVisibleUI() {
    try {
      if (typeof aplicarTema === "function") aplicarTema();
      if (typeof aplicarModulos === "function") aplicarModulos();

      const conta = document.getElementById("onbConta");
      const onb = document.getElementById("onb");
      const app = document.getElementById("app");
      if (S.perfil) {
        if (conta) conta.classList.add("hide");
        if (onb) onb.classList.add("hide");
        if (app) app.classList.remove("hide");
        const active = document.querySelector("nav button.on[data-tab]");
        if (active && typeof irPara === "function") irPara(active.dataset.tab);
        else if (typeof renderHoje === "function") renderHoje();
      }
    } catch (e) { console.warn("refresh UI cloud-v2:", e); }
  }

  function safeToApplyNow() {
    if (document.hidden) return true;
    if (document.querySelector(".modal")) return false;
    const a = document.activeElement;
    if (!a) return true;
    return !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }

  async function applyPayload(payload, updated, opts) {
    if (!payload || payload.version !== 2 || !payload.snapshot) return false;
    if (payload.rev && payload.rev === lastRev) {
      if (updated) persistMeta(payload, updated);
      return false;
    }
    if (!safeToApplyNow() && !(opts && opts.force)) return false;

    applyingRemote = true;
    try {
      if (typeof mesclar === "function" && typeof VAZIO !== "undefined") {
        S = mesclar(clone(VAZIO), clone(payload.snapshot));
      } else {
        S = clone(payload.snapshot);
      }
      // grava direto no localStorage para não disparar um upload de volta.
      localStorage.setItem(BASE_KEY, JSON.stringify(S));
      persistMeta(payload, updated);
      dirty = false;
    } finally {
      applyingRemote = false;
    }
    refreshVisibleUI();
    return true;
  }

  async function pushSnapshot(silent) {
    if (!session || !navigator.onLine || syncing || !dirty) return false;
    syncing = true;
    const N = window.Nuvem;
    if (N) { N.estado = "sincronizando"; if (typeof renderConta === "function") renderConta(); }
    try {
      const c = await getClient();
      const payload = makePayload();
      const row = {
        id: rowId(session.user.id),
        user_id: session.user.id,
        gtin: GTIN,
        produto: payload,
        fonte: "muse-sync-v2"
      };
      const { data, error } = await c.from("cache_codigo_barras")
        .upsert(row, { onConflict: "id" })
        .select("atualizado_em")
        .single();
      if (error) throw error;
      persistMeta(payload, data && data.atualizado_em);
      dirty = false;
      if (N) { N.estado = "ok"; N.ultima = new Date(); N.erro = null; }
      if (!silent && typeof toast === "function") toast("Sincronizado em todos os aparelhos.");
      return true;
    } catch (e) {
      console.warn("cloud-v2 push:", e);
      if (window.Nuvem) { Nuvem.estado = "erro"; Nuvem.erro = e.message; }
      if (!silent && typeof toast === "function") toast("Não consegui sincronizar agora. Seus dados continuam salvos neste aparelho.");
      return false;
    } finally {
      syncing = false;
      if (typeof renderConta === "function") renderConta();
    }
  }

  async function pullSnapshot(force, silent) {
    if (!session || !navigator.onLine || syncing || dirty) return false;
    try {
      const row = await readRow(false);
      if (!row || !row.produto) return false;
      const changed = force || row.produto.rev !== lastRev || (row.atualizado_em && row.atualizado_em !== lastServerUpdated);
      if (!changed) return false;
      const applied = await applyPayload(row.produto, row.atualizado_em, { force: !!force });
      if (applied && !silent && typeof toast === "function") toast("Atualizado com as mudanças de outro aparelho.");
      return applied;
    } catch (e) {
      console.warn("cloud-v2 pull:", e);
      return false;
    }
  }

  async function pollRevision() {
    if (!initialized || !session || !navigator.onLine || dirty || syncing) return;
    try {
      const row = await readRow(true);
      if (!row || !row.atualizado_em) return;
      if (row.atualizado_em !== lastServerUpdated) await pullSnapshot(false, true);
    } catch (e) { console.warn("cloud-v2 poll:", e); }
  }

  async function seedOrRestore() {
    const existing = await readRow(false);
    if (existing && existing.produto && existing.produto.version === 2) {
      await applyPayload(existing.produto, existing.atualizado_em, { force: true });
      return "restored";
    }

    // Migração transparente: antes de criar o snapshot oficial, aproveita os
    // dados já existentes nas tabelas antigas do Supabase quando possível.
    if (originalCloudDownload && navigator.onLine) {
      applyingRemote = true;
      try { await originalCloudDownload(true); }
      catch (e) { console.warn("migração cloud-v1:", e); }
      finally { applyingRemote = false; }
    }

    if (!S || !S.perfil) return "empty";

    // Primeiro aparelho que chegar cria o estado canônico. Insert, não upsert,
    // evita dois aparelhos antigos se atropelarem durante a migração inicial.
    const c = await getClient();
    const payload = makePayload();
    const { data, error } = await c.from("cache_codigo_barras").insert({
      id: rowId(session.user.id), user_id: session.user.id, gtin: GTIN,
      produto: payload, fonte: "muse-sync-v2"
    }).select("atualizado_em").single();

    if (error) {
      // Se outro aparelho criou milissegundos antes, ele venceu. Baixa o dele.
      if (String(error.code) === "23505") {
        const winner = await readRow(false);
        if (winner && winner.produto) await applyPayload(winner.produto, winner.atualizado_em, { force: true });
        return "restored";
      }
      throw error;
    }
    persistMeta(payload, data && data.atualizado_em);
    dirty = false;
    return "seeded";
  }

  function installSaveHook() {
    const previousSave = window.salvar;
    if (typeof previousSave !== "function" || previousSave.__cloudV2) return;
    function saveV2() {
      const r = previousSave.apply(this, arguments);
      if (!applyingRemote && session && initialized) {
        dirty = true;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => pushSnapshot(true), 500);
      }
      return r;
    }
    saveV2.__cloudV2 = true;
    window.salvar = saveV2;
  }

  function overrideOldCloud() {
    const N = window.Nuvem;
    if (!N) return;
    if (!originalCloudDownload && typeof N.baixarDaNuvem === "function") originalCloudDownload = N.baixarDaNuvem.bind(N);

    N.sincronizar = async function (silent) {
      if (dirty) return pushSnapshot(!!silent);
      return pullSnapshot(false, !!silent);
    };
    N.baixarDaNuvem = async function (silent) { return pullSnapshot(true, !!silent); };
    N.syncV2 = true;
  }

  async function waitForBaseAuth() {
    for (let i = 0; i < 120; i++) {
      const N = window.Nuvem;
      if (N && N.pronta) break;
      await sleep(100);
    }
    const c = await getClient();
    const { data, error } = await c.auth.getSession();
    if (error) throw error;
    session = data.session || null;
    return c;
  }

  async function start() {
    try {
      overrideOldCloud();
      installSaveHook();
      const c = await waitForBaseAuth();
      overrideOldCloud(); // garante override depois de qualquer bootstrap tardio
      installSaveHook();

      if (!session) return;
      const result = await seedOrRestore();
      initialized = true;

      // Depois da migração/restauração, o estado local passa a representar a nuvem.
      if (result === "restored" || result === "seeded") refreshVisibleUI();

      c.auth.onAuthStateChange((_evt, s) => {
        session = s || null;
        if (!session) { initialized = false; dirty = false; return; }
        if (!initialized) setTimeout(start, 0);
      });

      if (!pollTimer) pollTimer = setInterval(pollRevision, 2500);
      addEventListener("online", () => { if (dirty) pushSnapshot(true); else pullSnapshot(false, true); });
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) { if (dirty) pushSnapshot(true); else pollRevision(); }
      });
    } catch (e) {
      console.warn("cloud-v2 start:", e);
      initialized = true; // não bloqueia o uso local se a nuvem falhar
      if (typeof toast === "function") toast("A sincronização entre aparelhos está temporariamente indisponível. Seus dados seguem salvos aqui.");
    }
  }

  // O arquivo é carregado depois de nuvem.js. Executar após o DOM garante que
  // o bootstrap de autenticação base já começou, mas sem exigir nova configuração.
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
