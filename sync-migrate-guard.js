/* muse. — guarda de migração v1 -> v2.
   Se este aparelho já tem um perfil, ele é preservado como candidato inicial
   ao estado canônico. Só recorremos ao download legado quando o aparelho está
   vazio. Isso evita uma cópia antiga da nuvem apagar mudanças locais recentes. */
"use strict";
(function () {
  function instalar() {
    const N = window.Nuvem;
    if (!N || typeof N.baixarDaNuvem !== "function" || N.baixarDaNuvem.__migrationGuard) return;
    const antigo = N.baixarDaNuvem.bind(N);
    const guardado = async function (silencioso) {
      if (typeof S !== "undefined" && S && S.perfil) return false;
      return antigo(silencioso);
    };
    guardado.__migrationGuard = true;
    N.baixarDaNuvem = guardado;
  }
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", instalar, { once: true });
  else instalar();
})();
