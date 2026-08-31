/* muse. — camada de nuvem: conta, sincronização e fila offline.
   Fica inteiramente dormente enquanto config.js estiver vazio:
   sem requisição, sem download de biblioteca, sem custo. */
"use strict";
(function () {
  const C = window.MUSE_CONFIG || {};
  const LIGADO = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);
  const CDN = "https://esm.sh/@supabase/supabase-js@2";

  let sb = null, sessao = null, sincronizando = false;
  const N = window.Nuvem = { ligada: LIGADO, estado: "local", usuario: null };

  /* ---------------------------------------------------------
     MAPA DE SINCRONIZAÇÃO
     Uma linha por tabela. `ler` extrai do estado local, `gravar`
     devolve ao estado local. Nada de acoplar a UI ao banco.
     --------------------------------------------------------- */
  const cent = r => Math.round((Number(r) || 0) * 100);
  const reais = c => (Number(c) || 0) / 100;

  const MAPA = [
    { t: "perfis", chave: "user_id", unico: true,
      ler: S => S.perfil ? [{ nome: S.perfil.nome, peso_kg: S.perfil.peso, altura_cm: S.perfil.altura, idade: S.perfil.idade,
          sexo_biologico: S.perfil.sexo, fator_atividade: S.perfil.ativ, objetivo: S.perfil.objetivo,
          meta_kcal: S.perfil.meta, meta_prot_g: S.perfil.prot, meta_carb_g: S.perfil.carb, meta_lip_g: S.perfil.gord,
          meta_agua_ml: S.perfil.agua, estrategia_gasto: S.perfil.estrategiaGasto || "fator" }] : [],
      gravar: (S, rs) => { const r = rs[0]; if (!r) return;
        S.perfil = Object.assign(S.perfil || {}, { nome: r.nome, peso: +r.peso_kg, altura: r.altura_cm, idade: r.idade,
          sexo: r.sexo_biologico, ativ: +r.fator_atividade, objetivo: r.objetivo, meta: r.meta_kcal, prot: r.meta_prot_g,
          carb: r.meta_carb_g, gord: r.meta_lip_g, agua: r.meta_agua_ml, estrategiaGasto: r.estrategia_gasto }); } },

    { t: "config_usuario", chave: "user_id", unico: true,
      ler: S => [{ tema: S.cfg.tema || "auto", modulos: S.modulos, lembretes: S.cfg.lembretes }],
      gravar: (S, rs) => { const r = rs[0]; if (!r) return;
        S.cfg.tema = r.tema || "auto"; S.modulos = r.modulos || S.modulos; S.cfg.lembretes = r.lembretes || S.cfg.lembretes; } },

    { t: "blocos_rotina", chave: "id",
      ler: S => S.rotina.blocos.map(b => ({ id: b.id, titulo: b.titulo, categoria: b.cat, hora_ini: b.ini || null,
        hora_fim: b.fim || null, recorrencia: b.rec, data_unica: b.rec && b.rec.tipo === "unica" ? b.data : null })),
      gravar: (S, rs) => S.rotina.blocos = rs.map(r => ({ id: r.id, titulo: r.titulo, cat: r.categoria, ini: r.hora_ini || "",
        fim: r.hora_fim || "", rec: r.recorrencia, data: r.data_unica || r.criado_em?.slice(0, 10) })) },

    { t: "registros_rotina", chave: "id",
      ler: S => { const o = [];
        for (const [dia, ids] of Object.entries(S.rotina.feitos || {})) ids.forEach(b => o.push({ id: hashId(dia + b + "feito"), bloco_id: b, dia, estado: "feito" }));
        for (const [dia, ids] of Object.entries(S.rotina.pulados || {})) ids.forEach(b => o.push({ id: hashId(dia + b + "pulado"), bloco_id: b, dia, estado: "pulado" }));
        for (const [dia, ids] of Object.entries(S.rotina.adiados || {})) ids.forEach(b => o.push({ id: hashId(dia + b + "adiado"), bloco_id: b, dia, estado: "adiado" }));
        return o; },
      gravar: (S, rs) => { const f = {}, p = {}, a = {};
        rs.forEach(r => { const alvo = r.estado === "feito" ? f : r.estado === "pulado" ? p : a;
          (alvo[r.dia] = alvo[r.dia] || []).push(r.bloco_id); });
        S.rotina.feitos = f; S.rotina.pulados = p; S.rotina.adiados = a; } },

    { t: "itens_refeicao", chave: "id",
      ler: S => { const o = [];
        for (const [dia, itens] of Object.entries(S.alim.reg || {})) itens.forEach(i => o.push({
          id: i.id || (i.id = uid()), dia, refeicao: i.ref, nome: i.nome, gramas: i.g, kcal: i.kcal,
          prot_g: i.p, carb_g: i.c, lip_g: i.l, nutrientes: i.nutr || null, fonte: i.fonte || "TACO",
          fonte_versao: i.fonte === "TACO" ? TACO_FONTE.versao : null, gtin: i.gtin || null }));
        return o; },
      gravar: (S, rs) => { const m = {};
        rs.forEach(r => (m[r.dia] = m[r.dia] || []).push({ id: r.id, ref: r.refeicao, nome: r.nome, g: +r.gramas,
          kcal: +r.kcal, p: +r.prot_g, c: +r.carb_g, l: +r.lip_g, nutr: r.nutrientes, fonte: r.fonte, gtin: r.gtin }));
        S.alim.reg = m; } },

    { t: "registros_agua", chave: "id",
      ler: S => Object.entries(S.agua || {}).map(([dia, ml]) => ({ id: hashId("agua" + dia), dia, ml })),
      gravar: (S, rs) => { const m = {}; rs.forEach(r => m[r.dia] = r.ml); S.agua = m; } },

    { t: "transacoes", chave: "id",
      ler: S => S.fin.gastos.map(g => ({ id: g.id || (g.id = uid()), dia: g.data, descricao: g.desc, categoria: g.cat,
        valor_centavos: cent(g.val), etiqueta: g.tag || null, parcelas_total: g.parc ? g.parc.total : null, origem: g.origem || null })),
      gravar: (S, rs) => S.fin.gastos = rs.map(r => ({ id: r.id, data: r.dia, desc: r.descricao, cat: r.categoria,
        val: reais(r.valor_centavos), tag: r.etiqueta || "", parc: r.parcelas_total ? { total: r.parcelas_total } : null, origem: r.origem })) },

    { t: "renda", chave: "user_id", unico: true,
      ler: S => [{ fixa_centavos: cent(S.fin.renda.fixa), extra_centavos: cent(S.fin.renda.extra) }],
      gravar: (S, rs) => { const r = rs[0]; if (r) S.fin.renda = { fixa: reais(r.fixa_centavos), extra: reais(r.extra_centavos) }; } },

    { t: "orcamentos", chave: "id",
      ler: S => Object.entries(S.fin.orc || {}).filter(([, v]) => v > 0).map(([c, v]) => ({ id: hashId("orc" + c), categoria: c, limite_centavos: cent(v) })),
      gravar: (S, rs) => { const m = {}; rs.forEach(r => m[r.categoria] = reais(r.limite_centavos)); S.fin.orc = m; } },

    { t: "metas_economia", chave: "id",
      ler: S => S.fin.metas.map(m => ({ id: m.id || (m.id = uid()), nome: m.nome, alvo_centavos: cent(m.alvo),
        guardado_centavos: cent(m.guardado), prazo: m.prazo || null })),
      gravar: (S, rs) => S.fin.metas = rs.map(r => ({ id: r.id, nome: r.nome, alvo: reais(r.alvo_centavos), guardado: reais(r.guardado_centavos), prazo: r.prazo })) },

    { t: "registros_humor", chave: "id",
      ler: S => (S.bem.humor || []).map(h => ({ id: hashId("humor" + h.data), dia: h.data, humor: h.humor, energia: h.energia, sono: h.sono, nota: h.nota || null })),
      gravar: (S, rs) => S.bem.humor = rs.map(r => ({ data: r.dia, humor: r.humor, energia: r.energia, sono: r.sono, nota: r.nota })) },

    { t: "diario", chave: "id",
      ler: S => Object.entries(S.bem.diario || {}).map(([dia, v]) => ({ id: hashId("diario" + dia), dia, pergunta: v.q || null, texto: v.txt || v })),
      gravar: (S, rs) => { const m = {}; rs.forEach(r => m[r.dia] = { q: r.pergunta, txt: r.texto }); S.bem.diario = m; } },

    { t: "contatos_confianca", chave: "id",
      ler: S => (S.bem.contatos || []).map(c => ({ id: c.id || (c.id = uid()), nome: c.nome, telefone: c.tel })),
      gravar: (S, rs) => S.bem.contatos = rs.map(r => ({ id: r.id, nome: r.nome, tel: r.telefone })) },

    { t: "medicamentos", chave: "id",
      ler: S => (S.bem.meds || []).map(m => ({ id: m.id, nome: m.nome, dose: m.dose || null, horarios: m.horas || [] })),
      gravar: (S, rs) => S.bem.meds = rs.map(r => ({ id: r.id, nome: r.nome, dose: r.dose || "", horas: r.horarios || [] })) },

    { t: "registros_medicamento", chave: "id",
      ler: S => { const o = [];
        for (const [dia, marcas] of Object.entries(S.bem.tomadas || {})) marcas.forEach(m => {
          const [med, hora] = String(m).split("|");
          o.push({ id: hashId(dia + m), medicamento_id: med, dia, horario: hora, estado: "tomado" }); });
        return o; },
      gravar: (S, rs) => { const m = {}; rs.forEach(r => (m[r.dia] = m[r.dia] || []).push(r.medicamento_id + "|" + r.horario)); S.bem.tomadas = m; } },

    { t: "registros_sono", chave: "id",
      ler: S => Object.entries(S.sono.reg || {}).map(([dia, n]) => ({ id: hashId("sono" + dia), dia, deitou: n.ini || null,
        acordou: n.fim || null, horas: n.horas, minutos: n.min || 0, qualidade: n.qual || null, nota: n.nota || null })),
      gravar: (S, rs) => { const m = {}; rs.forEach(r => m[r.dia] = { ini: r.deitou, fim: r.acordou, horas: r.horas, min: r.minutos, qual: r.qualidade, nota: r.nota }); S.sono.reg = m; } },

    { t: "registros_atividade", chave: "id",
      ler: S => { const o = [];
        for (const [dia, lista] of Object.entries(S.ativ.reg || {})) lista.forEach(a => o.push({ id: a.id, dia, tipo: a.tipo,
          nome: a.nome, met: a.met, minutos: a.min, esforco: a.intens || null, kcal_estimadas: a.kcal, observacao: a.obs || null }));
        return o; },
      gravar: (S, rs) => { const m = {}; rs.forEach(r => (m[r.dia] = m[r.dia] || []).push({ id: r.id, tipo: r.tipo, nome: r.nome,
          met: +r.met, min: r.minutos, intens: r.esforco, kcal: r.kcal_estimadas, obs: r.observacao })); S.ativ.reg = m; } },

    { t: "listas_compras", chave: "id",
      ler: S => S.compras.listas.map(l => ({ id: l.id, nome: l.nome, criada: l.criada, fechada: !!l.fechada,
        fechada_em: l.fechadaEm || null, total_centavos: l.total ? cent(l.total) : null })),
      gravar: (S, rs) => { const antigas = S.compras.listas;
        S.compras.listas = rs.map(r => ({ id: r.id, nome: r.nome, criada: r.criada, fechada: r.fechada,
          fechadaEm: r.fechada_em, total: r.total_centavos ? reais(r.total_centavos) : null, mercado: false,
          itens: (antigas.find(x => x.id === r.id) || {}).itens || [] })); } },

    { t: "itens_compra", chave: "id",
      ler: S => { const o = []; S.compras.listas.forEach(l => l.itens.forEach(i => o.push({ id: i.id, lista_id: l.id,
        nome: i.nome, quantidade: i.qtd, unidade: i.un || null, categoria: i.cat, observacao: i.obs || null, no_carrinho: !!i.carrinho }))); return o; },
      gravar: (S, rs) => { S.compras.listas.forEach(l => l.itens = []);
        rs.forEach(r => { const l = S.compras.listas.find(x => x.id === r.lista_id); if (l) l.itens.push({ id: r.id, nome: r.nome,
          qtd: r.quantidade, un: r.unidade || "", cat: r.categoria, obs: r.observacao || "", carrinho: r.no_carrinho }); }); } },

    { t: "perfil_capilar", chave: "user_id", unico: true,
      ler: S => S.cabelo.perfil || S.cabelo.inicio ? [{ curvatura: (S.cabelo.perfil || {}).curv, espessura: (S.cabelo.perfil || {}).esp,
        oleosidade: (S.cabelo.perfil || {}).ole, quimica: (S.cabelo.perfil || {}).quim, objetivo: (S.cabelo.perfil || {}).obj,
        inicio_cronograma: S.cabelo.inicio || null }] : [],
      gravar: (S, rs) => { const r = rs[0]; if (!r) return;
        S.cabelo.perfil = { curv: r.curvatura, esp: r.espessura, ole: r.oleosidade, quim: r.quimica, obj: r.objetivo };
        S.cabelo.inicio = r.inicio_cronograma; } },

    { t: "etapas_capilar", chave: "id",
      ler: S => S.cabelo.etapas.map(e => ({ id: hashId("cab" + e.id), etapa: e.id, frequencia_dias: e.freq })),
      gravar: (S, rs) => S.cabelo.etapas = rs.map(r => ({ id: r.etapa, freq: r.frequencia_dias })) },

    { t: "registros_capilar", chave: "id",
      ler: S => Object.entries(S.cabelo.logs || {}).map(([dia, l]) => ({ id: hashId("cablog" + dia), dia, etapa: l.etapa,
        produto: l.produto || null, resultado: l.result || null, observacao: l.obs || null })),
      gravar: (S, rs) => { const m = {}; rs.forEach(r => m[r.dia] = { etapa: r.etapa, produto: r.produto, result: r.resultado, obs: r.observacao }); S.cabelo.logs = m; } }
  ];

  function hashId(txt) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < txt.length; i++) {
      k = txt.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    const p = n => ((n >>> 0).toString(16).padStart(8, "0"));
    return "d" + p(h1 ^ h2 ^ h3 ^ h4) + p(h2 ^ h1) + p(h3 ^ h1) + p(h4 ^ h1);
  }
  N._hashId = hashId;

  const DB = "muse-fila", LOJA = "pendentes";
  function abrirDB() {
    return new Promise((ok, err) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(LOJA, { keyPath: "chave" });
      r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error);
    });
  }
  async function enfileirar(tabela, linha) {
    try {
      const db = await abrirDB();
      await new Promise(ok => {
        const tx = db.transaction(LOJA, "readwrite");
        tx.objectStore(LOJA).put({ chave: tabela + ":" + (linha.id || "unico"), tabela, linha, em: Date.now() });
        tx.oncomplete = ok;
      });
    } catch (e) { console.warn("fila:", e); }
  }
  async function lerFila() {
    try { const db = await abrirDB();
      return await new Promise(ok => { const r = db.transaction(LOJA).objectStore(LOJA).getAll(); r.onsuccess = () => ok(r.result || []); });
    } catch { return []; }
  }
  async function limparFila(chaves) {
    try { const db = await abrirDB();
      await new Promise(ok => { const tx = db.transaction(LOJA, "readwrite"); chaves.forEach(c => tx.objectStore(LOJA).delete(c)); tx.oncomplete = ok; });
    } catch { }
  }

  async function cliente() {
    if (sb) return sb;
    const { createClient } = await import(CDN);
    sb = createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return sb;
  }

  N.entrar = async function () {
    const c = await cliente();
    const { error } = await c.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.href.split("#")[0], scopes: "openid email profile" }
    });
    if (error) toast("Não consegui abrir o login: " + error.message);
  };

  N.sair = async function (apagarLocal) {
    const c = await cliente();
    await c.auth.signOut();
    sessao = null; N.usuario = null; N.estado = "local";
    try {
      const db = await abrirDB();
      await new Promise(ok => { const tx = db.transaction(LOJA, "readwrite"); tx.objectStore(LOJA).clear(); tx.oncomplete = ok; });
    } catch { }
    if (apagarLocal) { localStorage.removeItem(CHAVE); }
    location.reload();
  };

  N.apagarConta = async function () {
    const c = await cliente();
    const { error } = await c.rpc("apagar_minha_conta");
    if (error) { toast("Não consegui apagar agora: " + error.message); return false; }
    localStorage.removeItem(CHAVE);
    Object.keys(localStorage).filter(k => k.startsWith(CHAVE + ".backup")).forEach(k => localStorage.removeItem(k));
    return true;
  };

  async function enviarTudo(c, uid_) {
    for (const m of MAPA) {
      const linhas = m.ler(S).map(l => Object.assign({ user_id: uid_ }, l));
      if (!linhas.length) continue;
      const { error } = await c.from(m.t).upsert(linhas, { onConflict: m.chave });
      if (error) throw new Error(m.t + ": " + error.message);
    }
  }

  async function baixarTudo(c) {
    for (const m of MAPA) {
      const { data, error } = await c.from(m.t).select("*");
      if (error) throw new Error(m.t + ": " + error.message);
      if (data && (data.length || m.unico)) m.gravar(S, data);
    }
    salvar();
  }

  N.sincronizar = async function (silencioso) {
    if (!LIGADO || !sessao || sincronizando || !navigator.onLine) return false;
    sincronizando = true; N.estado = "sincronizando"; pintarEstado();
    try {
      const c = await cliente();
      const pend = await lerFila();
      for (const p of pend) {
        const { error } = await c.from(p.tabela).upsert([Object.assign({ user_id: sessao.user.id }, p.linha)], { onConflict: "id" });
        if (error) throw error;
      }
      if (pend.length) await limparFila(pend.map(p => p.chave));
      await enviarTudo(c, sessao.user.id);
      N.estado = "ok"; N.ultima = new Date(); N.erro = null;
      if (!silencioso) toast("Sincronizado.");
      return true;
    } catch (e) {
      console.warn("sync:", e);
      N.estado = "erro"; N.erro = e.message;
      if (!silencioso) toast("Não consegui sincronizar agora: " + e.message);
      return false;
    } finally { sincronizando = false; pintarEstado(); }
  };

  N.baixarDaNuvem = async function (silencioso) {
    if (!LIGADO || !sessao || !navigator.onLine) return false;
    try {
      const c = await cliente();
      await baixarTudo(c);
      N.estado = "ok"; N.erro = null; pintarEstado();
      if (!silencioso) toast("Dados restaurados da sua conta.");
      return true;
    } catch (e) {
      console.warn("download da nuvem:", e);
      N.estado = "erro"; N.erro = e.message; pintarEstado();
      if (!silencioso) toast("Não consegui baixar seus dados: " + e.message);
      return false;
    }
  };

  N.migrarParaNuvem = async function () {
    const c = await cliente();
    const resumo = MAPA.map(m => ({ t: m.t, n: m.ler(S).length })).filter(x => x.n);
    const remoto = {};
    for (const m of MAPA) { const { data } = await c.from(m.t).select("id", { count: "exact", head: false }); remoto[m.t] = (data || []).length; }
    const temRemoto = Object.values(remoto).some(n => n > 0);

    return new Promise(resolve => {
      const d = modal("Levar seus dados para a conta", `
        <p class="mut" style="font-size:13.5px;margin-bottom:14px;line-height:1.55">
          ${temRemoto ? "Esta conta já tem dados na nuvem. Registros com o mesmo identificador serão atualizados; o resto é somado. Nada é apagado."
                      : "Nada foi enviado ainda. Isto é o que vai subir:"}</p>
        ${resumo.map(x => `<div class="nutri-linha"><span>${esc(x.t.replace(/_/g, " "))}</span><b>${x.n}</b>${remoto[x.t] ? `<span class="mut" style="font-size:12px">${remoto[x.t]} na nuvem</span>` : ""}</div>`).join("")}
        <p class="mut" style="font-size:12px;margin-top:12px">Um backup do estado atual fica guardado neste aparelho antes do envio. Se der errado, dá para voltar.</p>
        <button class="btn full" id="mgS" style="margin-top:16px">Enviar para a conta</button>
        <button class="btn full sec sm" id="mgN" style="margin-top:10px">Agora não</button>`);
      $("#mgS", d).onclick = async () => {
        try { localStorage.setItem(CHAVE + ".antes-da-nuvem", JSON.stringify(S)); } catch { }
        $("#mgS", d).textContent = "Enviando…"; $("#mgS", d).disabled = true;
        try { await enviarTudo(c, sessao.user.id); await baixarTudo(c); d.remove(); toast("Dados na conta."); resolve(true); }
        catch (e) { toast("Falhou: " + e.message + ". Nada foi perdido aqui."); resolve(false); }
      };
      $("#mgN", d).onclick = () => { d.remove(); resolve(false); };
    });
  };

  N.reverterMigracao = function () {
    const b = localStorage.getItem(CHAVE + ".antes-da-nuvem");
    if (!b) return toast("Não há backup pré-nuvem neste aparelho.");
    if (!confirm("Voltar o estado deste aparelho para antes do envio? Os dados na nuvem não são apagados.")) return;
    localStorage.setItem(CHAVE, b); location.reload();
  };

  function pintarEstado() {
    const el = document.getElementById("estadoNuvem"); if (!el) return;
    const off = !navigator.onLine;
    const mapa = { local: "", sincronizando: "sincronizando…", ok: "sincronizado", erro: "sincronização pendente" };
    el.textContent = off ? "offline" : (N.usuario ? mapa[N.estado] || "" : "");
    el.className = "hoje" + (off || N.estado === "erro" ? " alerta" : "");
    el.style.color = off || N.estado === "erro" ? "var(--ocre)" : "var(--mut)";
    const cc = document.getElementById("cardConta"); if (cc && typeof renderConta === "function") renderConta();
  }
  addEventListener("online", () => { pintarEstado(); N.sincronizar(true); });
  addEventListener("offline", pintarEstado);

  const salvarOriginal = window.salvar;
  window.salvar = function () {
    salvarOriginal.apply(this, arguments);
    if (LIGADO && sessao) {
      clearTimeout(window.__syncTimer);
      window.__syncTimer = setTimeout(() => N.sincronizar(true), 2500);
    }
  };

  /* O onboarding cria o primeiro perfil. Enviamos imediatamente para a conta,
     além do debounce normal, para que fechar o PWA logo depois não perca o cadastro. */
  const finalizarOnbOriginal = window.finalizarOnb;
  if (typeof finalizarOnbOriginal === "function") {
    window.finalizarOnb = function () {
      const r = finalizarOnbOriginal.apply(this, arguments);
      if (LIGADO && sessao) setTimeout(() => N.sincronizar(false), 100);
      return r;
    };
  }

  let entradaResolvidaPara = null;
  async function resolverEntradaAutenticada(c) {
    if (!sessao) return false;
    const uidAtual = sessao.user.id;
    if (entradaResolvidaPara === uidAtual) return !!S.perfil;

    /* Se este contexto do PWA não tem perfil local, a conta remota é a fonte.
       Isso cobre troca de aparelho e também Safari x app instalado no iPhone. */
    if (!S.perfil && navigator.onLine) {
      try {
        await baixarTudo(c);
      } catch (e) {
        console.warn("restauração da conta:", e);
        N.estado = "erro"; N.erro = e.message; pintarEstado();
        return false;
      }
    }

    entradaResolvidaPara = uidAtual;
    const conta = document.getElementById("onbConta");
    const onb = document.getElementById("onb");
    const app = document.getElementById("app");

    if (S.perfil) {
      const appJaVisivel = app && !app.classList.contains("hide");
      if (conta) conta.classList.add("hide");
      if (onb) onb.classList.add("hide");
      if (app) app.classList.remove("hide");
      if (!appJaVisivel && typeof iniciarApp === "function") iniciarApp();
      return true;
    }

    if (conta) conta.classList.add("hide");
    if (typeof abrirOnb === "function") abrirOnb();
    return false;
  }

  N.iniciar = async function () {
    pintarEstado();
    if (!LIGADO) return;
    try {
      const c = await cliente();
      const { data } = await c.auth.getSession();
      sessao = data.session || null;

      c.auth.onAuthStateChange(async (evt, s) => {
        const trocou = sessao && s && sessao.user.id !== s.user.id;
        sessao = s;
        N.usuario = s ? { id: s.user.id, email: s.user.email, nome: s.user.user_metadata?.full_name } : null;
        if (trocou) { location.reload(); return; }

        if (s) {
          N.estado = "ok"; pintarEstado();
          const temPerfil = await resolverEntradaAutenticada(c);
          if (temPerfil) await N.sincronizar(true);
        } else {
          entradaResolvidaPara = null;
          N.estado = "local"; pintarEstado();
        }
      });

      if (sessao) {
        N.usuario = { id: sessao.user.id, email: sessao.user.email, nome: sessao.user.user_metadata?.full_name };
        N.estado = "ok"; pintarEstado();
        const temPerfil = await resolverEntradaAutenticada(c);
        if (temPerfil) await N.sincronizar(true);
        setInterval(() => N.sincronizar(true), C.SYNC_INTERVALO || 60000);
      }
    } catch (e) {
      console.warn("nuvem:", e);
      N.estado = "erro"; N.erro = e.message; pintarEstado();
    }
  };
  if (document.readyState !== "loading") N.iniciar(); else addEventListener("DOMContentLoaded", N.iniciar);
})();
