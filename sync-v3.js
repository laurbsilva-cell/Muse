/* muse. — sincronização v3 entre aparelhos.
   Usa a própria config_usuario, que já faz parte da nuvem do muse., como
   envelope do estado canônico. Assim não depende de uma tabela auxiliar que
   pode não existir no projeto Supabase já instalado.

   Regras:
   - a nuvem vence ao abrir outro aparelho;
   - toda alteração local sobe como snapshot completo;
   - exclusões também sincronizam;
   - se houver um snapshot v2 válido, ele é migrado;
   - na primeira ativação, tenta restaurar a nuvem antiga antes de eleger o
     estado canônico;
   - se esta camada falhar, a sincronização antiga é restaurada em vez de ficar
     parcialmente sobrescrita.
*/
"use strict";
(function () {
  const C = window.MUSE_CONFIG || {};
  if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) return;

  const BASE_KEY = typeof CHAVE !== "undefined" ? CHAVE : "minhabase.v1";
  const REV_KEY = BASE_KEY + ".cloud-v3-rev";
  const BACKUP_KEY = BASE_KEY + ".antes-do-sync-v3";
  const HIDDEN = "__muse_sync_v3";
  const V2_GTIN = "__muse_state_v2__";

  let originalSync = null;
  let originalDownload = null;
  let sessionUser = null;
  let initialized = false;
  let applyingRemote = false;
  let dirty = false;
  let syncing = false;
  let saveTimer = null;
  let pollTimer = null;
  let lastRev = localStorage.getItem(REV_KEY) || "";

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clone = value => JSON.parse(JSON.stringify(value));

  function hiddenMeta(payload) {
    return payload ? { version: 3, rev: payload.rev, saved_at: payload.saved_at } : null;
  }

  function cleanSnapshot() {
    const snap = clone(S);
    if (snap.modulos) delete snap.modulos[HIDDEN];
    if (snap.cfg && snap.cfg.lembretes) delete snap.cfg.lembretes[HIDDEN];
    return snap;
  }

  function makePayload() {
    return {
      version: 3,
      rev: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10),
      saved_at: new Date().toISOString(),
      snapshot: cleanSnapshot()
    };
  }

  function saveRev(payload) {
    if (!payload || !payload.rev) return;
    lastRev = payload.rev;
    localStorage.setItem(REV_KEY, lastRev);
  }

  function supabaseRef() {
    try { return new URL(C.SUPABASE_URL).hostname.split(".")[0]; }
    catch { return ""; }
  }

  function accessToken() {
    const ref = supabaseRef();
    const preferred = ref ? localStorage.getItem("sb-" + ref + "-auth-token") : null;
    const raws = preferred ? [preferred] : Object.keys(localStorage)
      .filter(k => /^sb-.+-auth-token$/.test(k))
      .map(k => localStorage.getItem(k));

    for (const raw of raws) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const token = parsed && (parsed.access_token || parsed.currentSession?.access_token || parsed.session?.access_token);
        if (token) return token;
      } catch { }
    }
    return "";
  }

  async function restGet(table, select, filters) {
    const token = accessToken();
    if (!token) throw new Error("sessão da conta ainda não ficou disponível");

    const qs = new URLSearchParams();
    qs.set("select", select);
    Object.entries(filters || {}).forEach(([k, v]) => qs.set(k, "eq." + v));
    qs.set("limit", "1");

    const r = await fetch(C.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + table + "?" + qs.toString(), {
      headers: {
        apikey: C.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + token,
        Accept: "application/json"
      }
    });
    const text = await r.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!r.ok) {
      const msg = body && (body.message || body.hint || body.code) ? (body.message || body.hint || body.code) : ("HTTP " + r.status);
      const err = new Error(msg);
      err.status = r.status;
      err.body = body;
      throw err;
    }
    return Array.isArray(body) ? (body[0] || null) : body;
  }

  async function readMeta() {
    if (!sessionUser) return null;
    return restGet("config_usuario", "lembretes,atualizado_em", { user_id: sessionUser.id });
  }

  async function readPayload() {
    if (!sessionUser) return null;
    const row = await restGet("config_usuario", "modulos,atualizado_em", { user_id: sessionUser.id });
    return row && row.modulos ? row.modulos[HIDDEN] || null : null;
  }

  async function tryReadV2() {
    if (!sessionUser) return null;
    try {
      const row = await restGet("cache_codigo_barras", "produto", { user_id: sessionUser.id, gtin: V2_GTIN });
      const p = row && row.produto;
      return p && p.version === 2 && p.snapshot ? p : null;
    } catch (e) {
      /* A v2 justamente podia falhar porque esta tabela não existia no banco
         em produção. Isso não deve impedir a v3 de seguir pela nuvem antiga. */
      console.warn("cloud-v3 migration v2 skipped:", e);
      return null;
    }
  }

  function stripHiddenLocal() {
    if (S.modulos) delete S.modulos[HIDDEN];
    if (S.cfg && S.cfg.lembretes) delete S.cfg.lembretes[HIDDEN];
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
    } catch (e) { console.warn("cloud-v3 refresh:", e); }
  }

  function safeToApplyNow() {
    if (document.hidden) return true;
    if (document.querySelector(".modal")) return false;
    const a = document.activeElement;
    return !a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }

  async function applyPayload(payload, force) {
    if (!payload || !payload.snapshot) return false;
    const version = Number(payload.version || 0);
    if (version !== 2 && version !== 3) return false;
    if (!force && payload.rev && payload.rev === lastRev) return false;
    if (!force && !safeToApplyNow()) return false;

    applyingRemote = true;
    try {
      if (typeof mesclar === "function" && typeof VAZIO !== "undefined") S = mesclar(clone(VAZIO), clone(payload.snapshot));
      else S = clone(payload.snapshot);
      stripHiddenLocal();
      localStorage.setItem(BASE_KEY, JSON.stringify(S));
      saveRev(payload);
      dirty = false;
    } finally {
      applyingRemote = false;
    }
    refreshVisibleUI();
    return true;
  }

  async function pushPayload(silent) {
    if (!sessionUser || !navigator.onLine || syncing) return false;
    syncing = true;
    const N = window.Nuvem;
    const payload = makePayload();

    if (N) { N.estado = "sincronizando"; if (typeof renderConta === "function") renderConta(); }

    const hadMod = S.modulos && Object.prototype.hasOwnProperty.call(S.modulos, HIDDEN);
    const oldMod = hadMod ? S.modulos[HIDDEN] : undefined;
    const lemb = S.cfg && S.cfg.lembretes ? S.cfg.lembretes : (S.cfg.lembretes = {});
    const hadLem = Object.prototype.hasOwnProperty.call(lemb, HIDDEN);
    const oldLem = hadLem ? lemb[HIDDEN] : undefined;

    try {
      S.modulos = S.modulos || {};
      S.modulos[HIDDEN] = payload;
      lemb[HIDDEN] = hiddenMeta(payload);

      const ok = await originalSync(true);
      if (!ok) throw new Error((N && N.erro) || "a nuvem não confirmou o envio");

      saveRev(payload);
      dirty = false;
      if (N) { N.estado = "ok"; N.ultima = new Date(); N.erro = null; }
      if (!silent && typeof toast === "function") toast("Sincronizado em todos os aparelhos.");
      return true;
    } catch (e) {
      console.warn("cloud-v3 push:", e);
      if (N) { N.estado = "erro"; N.erro = e.message; }
      if (!silent && typeof toast === "function") toast("Não consegui sincronizar agora. Seus dados continuam salvos neste aparelho.");
      return false;
    } finally {
      if (hadMod) S.modulos[HIDDEN] = oldMod; else if (S.modulos) delete S.modulos[HIDDEN];
      if (hadLem) lemb[HIDDEN] = oldLem; else delete lemb[HIDDEN];
      syncing = false;
      if (typeof renderConta === "function") renderConta();
    }
  }

  async function pullIfChanged(force, silent) {
    if (!sessionUser || !navigator.onLine || syncing || (dirty && !force)) return false;
    try {
      const metaRow = await readMeta();
      const meta = metaRow && metaRow.lembretes ? metaRow.lembretes[HIDDEN] : null;
      if (!meta || !meta.rev) return false;
      if (!force && meta.rev === lastRev) return false;
      const payload = await readPayload();
      if (!payload) return false;
      const applied = await applyPayload(payload, !!force);
      if (applied && !silent && typeof toast === "function") toast("Atualizado com as mudanças do outro aparelho.");
      return applied;
    } catch (e) {
      console.warn("cloud-v3 pull:", e);
      return false;
    }
  }

  async function seedOrRestore() {
    const metaRow = await readMeta();
    const meta = metaRow && metaRow.lembretes ? metaRow.lembretes[HIDDEN] : null;
    if (meta && meta.rev) {
      const payload = await readPayload();
      if (payload && payload.snapshot) {
        await applyPayload(payload, true);
        return "restored-v3";
      }
    }

    const oldV2 = await tryReadV2();
    if (oldV2) {
      await applyPayload(oldV2, true);
      dirty = true;
      await pushPayload(true);
      return "migrated-v2";
    }

    /* Primeira ativação real da v3: guarda uma cópia local e tenta restaurar
       o estado já existente no Supabase antes de escolher o canônico. Isso
       evita que um celular desatualizado apague mudanças feitas no computador. */
    try { if (S && S.perfil) localStorage.setItem(BACKUP_KEY, JSON.stringify(S)); } catch { }
    if (originalDownload && navigator.onLine) {
      try { await originalDownload(true); }
      catch (e) { console.warn("cloud-v3 legacy restore:", e); }
    }
    stripHiddenLocal();

    if (!S || !S.perfil) return "empty";
    dirty = true;
    await pushPayload(true);
    return "seeded";
  }

  function installSaveHook() {
    const previous = window.salvar;
    if (typeof previous !== "function" || previous.__cloudV3) return;
    function saveV3() {
      const result = previous.apply(this, arguments);
      if (!applyingRemote && initialized && sessionUser) {
        dirty = true;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => pushPayload(true), 650);
      }
      return result;
    }
    saveV3.__cloudV3 = true;
    window.salvar = saveV3;
  }

  async function waitForBaseCloud() {
    for (let i = 0; i < 200; i++) {
      const N = window.Nuvem;
      if (N && N.pronta) return N;
      await sleep(100);
    }
    throw new Error("a conta demorou demais para iniciar");
  }

  function installCloudOverrides(N) {
    N.sincronizar = async function (silent) {
      if (dirty) return pushPayload(!!silent);
      const pulled = await pullIfChanged(false, !!silent);
      if (!pulled && !silent && typeof toast === "function") toast("Tudo sincronizado.");
      return true;
    };
    N.baixarDaNuvem = async function (silent) { return pullIfChanged(true, !!silent); };
    N.syncV3 = true;
    N.syncV2 = false;
  }

  async function start() {
    const N = window.Nuvem;
    if (!N || !N.ligada) return;

    originalSync = typeof N.sincronizar === "function" ? N.sincronizar.bind(N) : null;
    originalDownload = typeof N.baixarDaNuvem === "function" ? N.baixarDaNuvem.bind(N) : null;
    if (!originalSync || !originalDownload) return;

    /* Pausa só o envio inicial da camada antiga. A própria Nuvem continua
       autenticando normalmente e libera N.pronta; depois a v3 assume. */
    N.sincronizar = async function () { return false; };

    try {
      await waitForBaseCloud();
      sessionUser = N.usuario || null;
      if (!sessionUser) {
        N.sincronizar = originalSync;
        N.baixarDaNuvem = originalDownload;
        return;
      }

      await seedOrRestore();
      initialized = true;
      installCloudOverrides(N);
      installSaveHook();
      stripHiddenLocal();
      localStorage.setItem(BASE_KEY, JSON.stringify(S));

      if (!pollTimer) pollTimer = setInterval(() => {
        if (!document.hidden && !dirty) pullIfChanged(false, true);
      }, 6000);

      addEventListener("online", () => { if (dirty) pushPayload(true); else pullIfChanged(false, true); });
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) { if (dirty) pushPayload(true); else pullIfChanged(false, true); }
      });
    } catch (e) {
      console.warn("cloud-v3 start:", e);
      N.sincronizar = originalSync;
      N.baixarDaNuvem = originalDownload;
      N.syncV3 = false;
      N.estado = "erro";
      N.erro = e.message;
      const detalhe = String(e.message || "erro desconhecido").slice(0, 120);
      if (typeof toast === "function") toast("Sincronização entre aparelhos: " + detalhe);
      if (typeof renderConta === "function") renderConta();
    }
  }

  if (document.readyState === "loading") addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
