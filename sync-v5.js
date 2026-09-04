/* muse. — sincronização v5 entre aparelhos.
   Estado canônico por conta, armazenado dentro de config_usuario.

   Diferenças importantes:
   - este script é carregado de forma bloqueante pelo config.js enquanto o HTML
     ainda está sendo analisado, então seu DOMContentLoaded roda antes do boot da
     nuvem antiga e consegue pausá-la sem corrida;
   - usa o cliente oficial do Supabase para reaproveitar a sessão já autenticada;
   - não cria estado compartilhado automaticamente quando ainda não existe.
     "Enviar dados deste aparelho" escolhe explicitamente a fonte inicial;
   - depois de criado, alterações sobem automaticamente e outros aparelhos
     baixam por revisão, foco, pageshow e polling;
   - última escrita vence, sempre com snapshot completo, então exclusões também
     sincronizam.
*/
"use strict";
(function () {
  const C = window.MUSE_CONFIG || {};
  if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) return;

  const CDN = "https://esm.sh/@supabase/supabase-js@2";
  const BASE_KEY = typeof CHAVE !== "undefined" ? CHAVE : "minhabase.v1";
  const REV_KEY = BASE_KEY + ".cloud-v5-rev";
  const BACKUP_KEY = BASE_KEY + ".antes-do-sync-v5";
  const HIDDEN = "__muse_sync_v5";
  const OLD_HIDDEN = ["__muse_sync_v4", "__muse_sync_v3", "__muse_sync_v2"];

  let client = null;
  let session = null;
  let initialized = false;
  let applyingRemote = false;
  let dirty = false;
  let syncing = false;
  let saveTimer = null;
  let pollTimer = null;
  let lastRev = localStorage.getItem(REV_KEY) || "";
  let remoteRev = "";
  let remoteSavedAt = "";
  let legacySync = null;
  let legacyDownload = null;
  let legacyMigrate = null;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

  function mergeSnapshot(base, novo) {
    if (novo === null || novo === undefined) return base;
    if (base === null || base === undefined) return clone(novo);
    if (Array.isArray(base) || typeof base !== "object") return clone(novo);
    if (typeof novo !== "object" || Array.isArray(novo)) return clone(novo);
    const r = {};
    for (const k of new Set([...Object.keys(base), ...Object.keys(novo)])) {
      r[k] = k in base && k in novo
        ? mergeSnapshot(base[k], novo[k])
        : clone(k in novo ? novo[k] : base[k]);
    }
    return r;
  }

  function stripHiddenObject(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
    delete obj[HIDDEN];
    OLD_HIDDEN.forEach(k => delete obj[k]);
    return obj;
  }

  function stripHiddenLocal() {
    if (typeof S === "undefined" || !S) return;
    if (S.modulos) stripHiddenObject(S.modulos);
    if (S.cfg && S.cfg.lembretes) stripHiddenObject(S.cfg.lembretes);
  }

  function cleanSnapshot() {
    const snap = clone(S);
    if (snap.modulos) stripHiddenObject(snap.modulos);
    if (snap.cfg && snap.cfg.lembretes) stripHiddenObject(snap.cfg.lembretes);
    return snap;
  }

  function makePayload() {
    return {
      version: 5,
      rev: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10),
      saved_at: new Date().toISOString(),
      snapshot: cleanSnapshot()
    };
  }

  function metaOf(payload) {
    return { version: 5, rev: payload.rev, saved_at: payload.saved_at };
  }

  function rememberRemote(payload) {
    if (!payload) return;
    if (payload.rev) {
      lastRev = payload.rev;
      remoteRev = payload.rev;
      localStorage.setItem(REV_KEY, payload.rev);
    }
    if (payload.saved_at) remoteSavedAt = payload.saved_at;
  }

  async function getClient() {
    if (client) return client;
    const { createClient } = await import(CDN);
    client = createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  async function getSession() {
    const c = await getClient();
    const { data, error } = await c.auth.getSession();
    if (error) throw error;
    session = data.session || null;
    return session;
  }

  async function readConfig() {
    if (!session) return null;
    const c = await getClient();
    const { data, error } = await c.from("config_usuario")
      .select("tema,modulos,lembretes,atualizado_em")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function readRemote() {
    const row = await readConfig();
    const meta = row && row.lembretes && row.lembretes[HIDDEN];
    const payload = row && row.modulos && row.modulos[HIDDEN];
    if (meta && meta.version === 5) {
      remoteRev = meta.rev || "";
      remoteSavedAt = meta.saved_at || "";
    }
    return {
      exists: !!(meta && meta.version === 5 && meta.rev && payload && payload.version === 5 && payload.snapshot),
      meta: meta || null,
      payload: payload || null,
      row
    };
  }

  async function writeRemote(payload) {
    if (!session) throw new Error("sem sessão autenticada");
    const c = await getClient();
    const current = await readConfig();

    const modules = stripHiddenObject(clone((S && S.modulos) || {}));
    const reminders = stripHiddenObject(clone((S && S.cfg && S.cfg.lembretes) || {}));
    modules[HIDDEN] = payload;
    reminders[HIDDEN] = metaOf(payload);

    const row = {
      user_id: session.user.id,
      tema: (S && S.cfg && S.cfg.tema) || (current && current.tema) || "auto",
      modulos: modules,
      lembretes: reminders
    };

    const { error } = await c.from("config_usuario")
      .upsert(row, { onConflict: "user_id" });
    if (error) throw error;
  }

  function refreshVisibleUI() {
    try {
      if (typeof aplicarTema === "function") aplicarTema();
      if (typeof aplicarModulos === "function") aplicarModulos();
      const conta = document.getElementById("onbConta");
      const onb = document.getElementById("onb");
      const app = document.getElementById("app");
      if (S && S.perfil) {
        if (conta) conta.classList.add("hide");
        if (onb) onb.classList.add("hide");
        if (app) app.classList.remove("hide");
        const active = document.querySelector("nav button.on[data-tab]");
        if (active && typeof irPara === "function") irPara(active.dataset.tab);
        else if (typeof renderHoje === "function") renderHoje();
      }
    } catch (e) { console.warn("cloud-v5 refresh:", e); }
  }

  function safeToApplyNow() {
    if (document.hidden) return true;
    if (document.querySelector(".modal")) return false;
    const a = document.activeElement;
    return !a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }

  async function applyPayload(payload, force) {
    if (!payload || payload.version !== 5 || !payload.snapshot) return false;
    if (!force && payload.rev === lastRev) return false;
    if (!force && !safeToApplyNow()) return false;

    applyingRemote = true;
    try {
      S = typeof VAZIO !== "undefined"
        ? mergeSnapshot(clone(VAZIO), clone(payload.snapshot))
        : clone(payload.snapshot);
      stripHiddenLocal();
      localStorage.setItem(BASE_KEY, JSON.stringify(S));
      rememberRemote(payload);
      dirty = false;
    } finally {
      applyingRemote = false;
    }
    refreshVisibleUI();
    return true;
  }

  async function pushSnapshot(silent, force) {
    if (!session || !navigator.onLine || syncing) return false;
    if (!dirty && !force) return true;
    syncing = true;
    const N = window.Nuvem;
    if (N) { N.estado = "sincronizando"; if (typeof renderConta === "function") renderConta(); }
    try {
      const payload = makePayload();
      await writeRemote(payload);
      rememberRemote(payload);
      dirty = false;
      if (N) {
        N.estado = "ok";
        N.ultima = new Date();
        N.erro = null;
        N.syncV5TemRemoto = true;
      }
      if (!silent && typeof toast === "function") toast("Dados deste aparelho enviados. Agora os outros aparelhos podem baixar.");
      return true;
    } catch (e) {
      console.warn("cloud-v5 push:", e);
      if (N) { N.estado = "erro"; N.erro = e.message; }
      if (!silent && typeof toast === "function") toast("Sincronização: " + String(e.message || e).slice(0, 150));
      return false;
    } finally {
      syncing = false;
      if (typeof renderConta === "function") renderConta();
    }
  }

  async function pullSnapshot(force, silent) {
    if (!session || !navigator.onLine || syncing || (dirty && !force)) return false;
    syncing = true;
    const N = window.Nuvem;
    try {
      const remote = await readRemote();
      if (!remote.exists) {
        if (N) { N.syncV5TemRemoto = false; if (!dirty) N.estado = "local"; }
        if (!silent && typeof toast === "function") toast("Ainda não há uma cópia compartilhada. No aparelho certo, toque em “Enviar dados deste aparelho”.");
        return false;
      }
      if (N) N.syncV5TemRemoto = true;
      if (!force && remote.payload.rev === lastRev) return false;
      const applied = await applyPayload(remote.payload, !!force);
      if (applied) {
        if (N) { N.estado = "ok"; N.ultima = new Date(); N.erro = null; }
        if (!silent && typeof toast === "function") toast("Atualizado com os dados do outro aparelho.");
      }
      return applied;
    } catch (e) {
      console.warn("cloud-v5 pull:", e);
      if (N) { N.estado = "erro"; N.erro = e.message; }
      if (!silent && typeof toast === "function") toast("Sincronização: " + String(e.message || e).slice(0, 150));
      return false;
    } finally {
      syncing = false;
      if (typeof renderConta === "function") renderConta();
    }
  }

  function installSaveHook() {
    const previous = window.salvar;
    if (typeof previous !== "function" || previous.__cloudV5) return;
    function saveV5() {
      const result = previous.apply(this, arguments);
      if (!applyingRemote && initialized && session) {
        dirty = true;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => pushSnapshot(true, false), 650);
      }
      return result;
    }
    saveV5.__cloudV5 = true;
    window.salvar = saveV5;
  }

  async function waitForNuvemObject() {
    for (let i = 0; i < 200; i++) {
      if (window.Nuvem && window.Nuvem.ligada) return window.Nuvem;
      await sleep(50);
    }
    throw new Error("a camada de conta não iniciou");
  }

  async function waitForBaseReady() {
    for (let i = 0; i < 300; i++) {
      if (window.Nuvem && window.Nuvem.pronta) return window.Nuvem;
      await sleep(50);
    }
    throw new Error("a conta demorou demais para ficar pronta");
  }

  function installDiagnostics(N) {
    N.syncV5 = true;
    N.syncV4 = false;
    N.syncV3 = false;
    N.syncV2 = false;
    N.syncDiagnostico = function () {
      return {
        versao: 5,
        conta: session && session.user ? session.user.email : null,
        localRev: lastRev || null,
        remotoRev: remoteRev || null,
        remotoEm: remoteSavedAt || null,
        dirty,
        online: navigator.onLine,
        temRemoto: !!N.syncV5TemRemoto
      };
    };

    const bind = () => {
      const el = document.getElementById("estadoNuvem");
      if (!el || el.dataset.syncV5Diag) return;
      el.dataset.syncV5Diag = "1";
      el.addEventListener("click", () => {
        const d = N.syncDiagnostico();
        const rev = d.remotoRev ? d.remotoRev.slice(-8) : "nenhuma";
        const texto = "sync v5 · remoto " + rev + (d.dirty ? " · enviando alteração" : "");
        if (typeof toast === "function") toast(texto);
      });
    };
    bind();
    setTimeout(bind, 1000);
  }

  function overrideCloud(N) {
    N.sincronizar = async function (silent) {
      if (dirty) return pushSnapshot(!!silent, false);
      return pullSnapshot(false, !!silent);
    };
    N.baixarDaNuvem = async function (silent) {
      return pullSnapshot(true, !!silent);
    };
    N.migrarParaNuvem = async function () {
      if (!session) return false;
      const okConfirm = typeof confirm !== "function" || confirm(
        "Enviar os dados DESTE aparelho para a conta?\n\nEles passarão a ser a referência que os outros aparelhos vão baixar."
      );
      if (!okConfirm) return false;
      try { localStorage.setItem(BACKUP_KEY, JSON.stringify(S)); } catch { }
      dirty = true;
      return pushSnapshot(false, true);
    };
  }

  function triggerSync() {
    if (!initialized || !session || document.hidden) return;
    if (dirty) pushSnapshot(true, false);
    else pullSnapshot(false, true);
  }

  async function start() {
    let N = null;
    try {
      N = await waitForNuvemObject();

      /* Captura os métodos antigos e os pausa ANTES do bootstrap de conta chegar
         ao ponto de sincronizar. Como este handler é registrado antes do handler
         de nuvem.js, não existe mais corrida na primeira abertura. */
      legacySync = typeof N.sincronizar === "function" ? N.sincronizar.bind(N) : null;
      legacyDownload = typeof N.baixarDaNuvem === "function" ? N.baixarDaNuvem.bind(N) : null;
      legacyMigrate = typeof N.migrarParaNuvem === "function" ? N.migrarParaNuvem.bind(N) : null;
      N.sincronizar = async function () { return false; };

      await waitForBaseReady();
      await getSession();
      if (!session) {
        if (legacySync) N.sincronizar = legacySync;
        if (legacyDownload) N.baixarDaNuvem = legacyDownload;
        if (legacyMigrate) N.migrarParaNuvem = legacyMigrate;
        return;
      }

      const remote = await readRemote();
      if (remote.exists) {
        await applyPayload(remote.payload, true);
        N.syncV5TemRemoto = true;
        N.estado = "ok";
      } else {
        N.syncV5TemRemoto = false;
        N.estado = "local";
      }

      initialized = true;
      overrideCloud(N);
      installSaveHook();
      installDiagnostics(N);
      stripHiddenLocal();
      localStorage.setItem(BASE_KEY, JSON.stringify(S));
      N.erro = null;
      if (typeof renderConta === "function") renderConta();

      if (!pollTimer) pollTimer = setInterval(triggerSync, 3000);
      addEventListener("online", triggerSync);
      addEventListener("focus", triggerSync);
      addEventListener("pageshow", triggerSync);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) triggerSync(); });
    } catch (e) {
      console.warn("cloud-v5 start:", e);
      if (N) {
        if (legacySync) N.sincronizar = legacySync;
        if (legacyDownload) N.baixarDaNuvem = legacyDownload;
        if (legacyMigrate) N.migrarParaNuvem = legacyMigrate;
        N.syncV5 = false;
        N.estado = "erro";
        N.erro = e.message;
      }
      if (typeof renderConta === "function") renderConta();
      if (typeof toast === "function") toast("Sincronização v5: " + String(e.message || e).slice(0, 150));
    }
  }

  /* O config.js carrega este arquivo enquanto o documento ainda está em parsing,
     então este listener fica na fila antes do Nuvem.iniciar de nuvem.js. */
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
