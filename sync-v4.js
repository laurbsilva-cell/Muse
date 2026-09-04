/* muse. — sincronização v4 entre aparelhos.
   Um snapshot canônico por conta é armazenado dentro de config_usuario, que já
   existe e já possui RLS por user_id. Esta camada não depende da sincronização
   legada de dezenas de tabelas para propagar mudanças entre aparelhos.
*/
"use strict";
(function () {
  const C = window.MUSE_CONFIG || {};
  if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) return;

  const BASE_KEY = typeof CHAVE !== "undefined" ? CHAVE : "minhabase.v1";
  const REV_KEY = BASE_KEY + ".cloud-v4-rev";
  const BACKUP_KEY = BASE_KEY + ".antes-do-sync-v4";
  const HIDDEN = "__muse_sync_v4";
  const OLD_HIDDEN = ["__muse_sync_v3", "__muse_sync_v2"];

  let sessionUser = null;
  let initialized = false;
  let applyingRemote = false;
  let dirty = false;
  let syncing = false;
  let saveTimer = null;
  let pollTimer = null;
  let lastRev = localStorage.getItem(REV_KEY) || "";
  let legacySync = null;
  let legacyDownload = null;

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
    if (S && S.modulos) stripHiddenObject(S.modulos);
    if (S && S.cfg && S.cfg.lembretes) stripHiddenObject(S.cfg.lembretes);
  }

  function cleanSnapshot() {
    const snap = clone(S);
    if (snap.modulos) stripHiddenObject(snap.modulos);
    if (snap.cfg && snap.cfg.lembretes) stripHiddenObject(snap.cfg.lembretes);
    return snap;
  }

  function makePayload() {
    return {
      version: 4,
      rev: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10),
      saved_at: new Date().toISOString(),
      snapshot: cleanSnapshot()
    };
  }

  function metaOf(payload) {
    return { version: 4, rev: payload.rev, saved_at: payload.saved_at };
  }

  function rememberRev(payload) {
    if (!payload || !payload.rev) return;
    lastRev = payload.rev;
    localStorage.setItem(REV_KEY, lastRev);
  }

  function projectRef() {
    try { return new URL(C.SUPABASE_URL).hostname.split(".")[0]; }
    catch { return ""; }
  }

  function extractToken(parsed) {
    if (!parsed || typeof parsed !== "object") return "";
    return parsed.access_token ||
      (parsed.currentSession && parsed.currentSession.access_token) ||
      (parsed.session && parsed.session.access_token) ||
      (parsed.data && parsed.data.session && parsed.data.session.access_token) || "";
  }

  function accessToken() {
    const ref = projectRef();
    const keys = [];
    if (ref) keys.push("sb-" + ref + "-auth-token");
    for (const k of Object.keys(localStorage)) {
      if (/^sb-.+-auth-token$/.test(k) && !keys.includes(k)) keys.push(k);
    }
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const token = extractToken(JSON.parse(raw));
        if (token) return token;
      } catch { }
    }
    return "";
  }

  async function api(path, options) {
    const token = accessToken();
    if (!token) throw new Error("sessão da conta não encontrada neste aparelho");
    const r = await fetch(C.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path, Object.assign({
      headers: {
        apikey: C.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + token,
        Accept: "application/json"
      }
    }, options || {}));
    const text = await r.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!r.ok) {
      const msg = body && typeof body === "object"
        ? (body.message || body.hint || body.code || ("HTTP " + r.status))
        : (body || ("HTTP " + r.status));
      throw new Error(String(msg));
    }
    return body;
  }

  async function readConfig(select) {
    if (!sessionUser) return null;
    const q = new URLSearchParams({
      select,
      user_id: "eq." + sessionUser.id,
      limit: "1"
    });
    const body = await api("config_usuario?" + q.toString());
    return Array.isArray(body) ? (body[0] || null) : null;
  }

  async function readRemoteMeta() {
    const row = await readConfig("lembretes,atualizado_em");
    return row && row.lembretes ? row.lembretes[HIDDEN] || null : null;
  }

  async function readRemotePayload() {
    const row = await readConfig("modulos,atualizado_em");
    return row && row.modulos ? row.modulos[HIDDEN] || null : null;
  }

  async function writeRemotePayload(payload) {
    const current = await readConfig("tema,modulos,lembretes");
    const localModules = stripHiddenObject(clone((S && S.modulos) || {}));
    const localReminders = stripHiddenObject(clone((S && S.cfg && S.cfg.lembretes) || {}));
    localModules[HIDDEN] = payload;
    localReminders[HIDDEN] = metaOf(payload);

    const row = {
      user_id: sessionUser.id,
      tema: (S && S.cfg && S.cfg.tema) || (current && current.tema) || "auto",
      modulos: localModules,
      lembretes: localReminders
    };

    const q = new URLSearchParams({ on_conflict: "user_id" });
    return api("config_usuario?" + q.toString(), {
      method: "POST",
      headers: {
        apikey: C.SUPABASE_ANON_KEY,
        Authorization: "Bearer " + accessToken(),
        Accept: "application/json",
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify([row])
    });
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
    } catch (e) { console.warn("cloud-v4 refresh:", e); }
  }

  function safeToApplyNow() {
    if (document.hidden) return true;
    if (document.querySelector(".modal")) return false;
    const a = document.activeElement;
    return !a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }

  async function applyPayload(payload, force) {
    if (!payload || payload.version !== 4 || !payload.snapshot) return false;
    if (!force && payload.rev === lastRev) return false;
    if (!force && !safeToApplyNow()) return false;

    applyingRemote = true;
    try {
      S = typeof VAZIO !== "undefined"
        ? mergeSnapshot(clone(VAZIO), clone(payload.snapshot))
        : clone(payload.snapshot);
      stripHiddenLocal();
      localStorage.setItem(BASE_KEY, JSON.stringify(S));
      rememberRev(payload);
      dirty = false;
    } finally {
      applyingRemote = false;
    }
    refreshVisibleUI();
    return true;
  }

  async function pushSnapshot(silent) {
    if (!sessionUser || !navigator.onLine || syncing) return false;
    syncing = true;
    const N = window.Nuvem;
    if (N) { N.estado = "sincronizando"; if (typeof renderConta === "function") renderConta(); }
    try {
      const payload = makePayload();
      await writeRemotePayload(payload);
      rememberRev(payload);
      dirty = false;
      if (N) { N.estado = "ok"; N.ultima = new Date(); N.erro = null; }
      if (!silent && typeof toast === "function") toast("Sincronizado em todos os aparelhos.");
      return true;
    } catch (e) {
      console.warn("cloud-v4 push:", e);
      if (N) { N.estado = "erro"; N.erro = e.message; }
      if (!silent && typeof toast === "function") toast("Sincronização: " + String(e.message).slice(0, 140));
      return false;
    } finally {
      syncing = false;
      if (typeof renderConta === "function") renderConta();
    }
  }

  async function pullSnapshot(force, silent) {
    if (!sessionUser || !navigator.onLine || syncing || (dirty && !force)) return false;
    syncing = true;
    try {
      const meta = await readRemoteMeta();
      if (!meta || meta.version !== 4 || !meta.rev) return false;
      if (!force && meta.rev === lastRev) return false;
      const payload = await readRemotePayload();
      const applied = await applyPayload(payload, !!force);
      if (applied && !silent && typeof toast === "function") toast("Atualizado com o outro aparelho.");
      return applied;
    } catch (e) {
      console.warn("cloud-v4 pull:", e);
      if (!silent && typeof toast === "function") toast("Sincronização: " + String(e.message).slice(0, 140));
      return false;
    } finally {
      syncing = false;
    }
  }

  async function bootstrap() {
    let meta = null;
    try { meta = await readRemoteMeta(); }
    catch (e) { throw e; }

    if (meta && meta.version === 4 && meta.rev) {
      const payload = await readRemotePayload();
      if (payload && payload.version === 4 && payload.snapshot) {
        await applyPayload(payload, true);
        return "restored";
      }
    }

    /* Primeira criação da v4. O aparelho aberto primeiro vira a fonte inicial.
       Uma cópia local é guardada antes do envio para reversão manual. */
    try { if (S && S.perfil) localStorage.setItem(BACKUP_KEY, JSON.stringify(S)); } catch { }
    stripHiddenLocal();
    if (!S || !S.perfil) {
      if (legacyDownload && navigator.onLine) {
        try { await legacyDownload(true); } catch (e) { console.warn("cloud-v4 legacy restore:", e); }
      }
      stripHiddenLocal();
    }
    if (!S || !S.perfil) return "empty";
    const ok = await pushSnapshot(true);
    if (!ok) throw new Error((window.Nuvem && window.Nuvem.erro) || "não consegui criar o estado compartilhado");
    return "seeded";
  }

  function installSaveHook() {
    const previous = window.salvar;
    if (typeof previous !== "function" || previous.__cloudV4) return;
    function saveV4() {
      const result = previous.apply(this, arguments);
      if (!applyingRemote && initialized && sessionUser) {
        dirty = true;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => pushSnapshot(true), 500);
      }
      return result;
    }
    saveV4.__cloudV4 = true;
    window.salvar = saveV4;
  }

  async function waitForBaseCloud() {
    for (let i = 0; i < 200; i++) {
      const N = window.Nuvem;
      if (N && N.pronta) return N;
      await sleep(100);
    }
    throw new Error("a conta demorou demais para iniciar");
  }

  function overrideCloud(N) {
    N.sincronizar = async function (silent) {
      if (dirty) return pushSnapshot(!!silent);
      const got = await pullSnapshot(false, !!silent);
      if (!got && !silent && typeof toast === "function") toast("Tudo sincronizado.");
      return true;
    };
    N.baixarDaNuvem = async function (silent) { return pullSnapshot(true, !!silent); };
    N.syncV4 = true;
    N.syncV3 = false;
    N.syncV2 = false;
  }

  function triggerPull() {
    if (!initialized || !sessionUser || document.hidden) return;
    if (dirty) pushSnapshot(true); else pullSnapshot(false, true);
  }

  async function start() {
    const N = window.Nuvem;
    if (!N || !N.ligada) return;

    legacySync = typeof N.sincronizar === "function" ? N.sincronizar.bind(N) : null;
    legacyDownload = typeof N.baixarDaNuvem === "function" ? N.baixarDaNuvem.bind(N) : null;

    /* Evita que a nuvem antiga sobrescreva config_usuario durante o bootstrap. */
    N.sincronizar = async function () { return false; };

    try {
      await waitForBaseCloud();
      sessionUser = N.usuario || null;
      if (!sessionUser) {
        if (legacySync) N.sincronizar = legacySync;
        if (legacyDownload) N.baixarDaNuvem = legacyDownload;
        return;
      }

      await bootstrap();
      initialized = true;
      overrideCloud(N);
      installSaveHook();
      stripHiddenLocal();
      localStorage.setItem(BASE_KEY, JSON.stringify(S));
      N.estado = "ok";
      N.erro = null;
      if (typeof renderConta === "function") renderConta();

      if (!pollTimer) pollTimer = setInterval(triggerPull, 3000);
      addEventListener("online", triggerPull);
      addEventListener("focus", triggerPull);
      addEventListener("pageshow", triggerPull);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) triggerPull(); });
    } catch (e) {
      console.warn("cloud-v4 start:", e);
      if (legacySync) N.sincronizar = legacySync;
      if (legacyDownload) N.baixarDaNuvem = legacyDownload;
      N.syncV4 = false;
      N.estado = "erro";
      N.erro = e.message;
      if (typeof renderConta === "function") renderConta();
      if (typeof toast === "function") toast("Sincronização entre aparelhos: " + String(e.message).slice(0, 140));
    }
  }

  if (document.readyState === "loading") addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
