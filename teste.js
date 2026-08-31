/* Testes com fixtures sintéticas. Nenhum dado pessoal real. */
const fs=require('fs');
const html=fs.readFileSync('app.html','utf8');
const js=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];

// ambiente mínimo de navegador
let store={};
global.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]};
Object.defineProperty(global.localStorage,'length',{get:()=>Object.keys(store).length});
global.matchMedia=()=>({matches:false,addEventListener(){}});
const noop=()=>{};
const el=()=>new Proxy({classList:{toggle:noop,add:noop,remove:noop,contains:()=>false},style:{},dataset:{},
  onclick:null,textContent:'',innerHTML:'',value:'',appendChild:noop,remove:noop,querySelector:()=>el(),
  querySelectorAll:()=>[],setAttribute:noop,getAttribute:()=>null,addEventListener:noop},{get:(t,p)=>p in t?t[p]:el()});
global.document={documentElement:{dataset:{},style:{}},querySelector:()=>el(),querySelectorAll:()=>[],
  createElement:()=>el(),body:{appendChild:noop},addEventListener:noop};
global.window=global; global.scrollTo=noop; global.navigator={serviceWorker:null,userAgent:''};
global.setTimeout=setTimeout; global.setInterval=()=>0; global.clearInterval=noop; global.clearTimeout=noop;
global.confirm=()=>true; global.prompt=()=>'apagar'; global.location={reload:noop};
global.Notification=undefined; global.URL={createObjectURL:()=>'',revokeObjectURL:noop}; global.Blob=function(){};
global.FileReader=function(){};

const ctx={};
new Function('with(this){'+js.replace(/^\s*"use strict";/,'')+'; Object.assign(globalThis.__x={},{VAZIO,ESQUEMA,migrar,mesclar,carregar,salvar,S,CHAVE,TACO,TACO_FONTE,ativo,MODULOS}); Object.assign(globalThis.__x2={},{gastoAtividade,METS,MET_FONTE,NUTRIENTES,parcelasComprometidas,gerarInsights,S,ETAPAS_CABELO,palpitarCategoria,CAT_COMPRA});}').call(ctx);
const X=globalThis.__x;

let ok=0,fail=0;
const t=(nome,cond,extra)=>{ if(cond){ok++;console.log('  ✓',nome);} else {fail++;console.log('  ✗',nome,extra??'');} };

console.log('\n— MIGRAÇÃO v1 → v2 (preservação de dados) —');
const v1={v:1,criado:'2026-01-10',perfil:{nome:'Fulana',peso:60,altura:165,idade:30,sexo:'F',ativ:1.55,objetivo:'manter',meta:2000,prot:96,agua:2100},
  rotina:{blocos:[{id:'b1',titulo:'trabalho',ini:'09:00',cat:'Trabalho',rec:{tipo:'diaria',dias:[]},data:'2026-01-10'}],feitos:{'2026-01-10':['b1']},prior:{}},
  alim:{reg:{'2026-01-10':[{ref:'Almoço',nome:'Arroz',g:100,kcal:128,p:2.5,c:28,l:0.2,fonte:'TACO'}]},custom:[],favs:[],import:[]},
  agua:{'2026-01-10':1500},
  fin:{renda:{fixa:3000,extra:0},gastos:[{data:'2026-01-10',cat:'Mercado',desc:'feira',valor:80,tag:'essencial'}],orc:{},metas:[]},
  bem:{meds:[{id:'m1',nome:'X',dose:'1cp',horas:['08:00']}],tomadas:{},humor:[],diario:{},contatos:[]},
  cfg:{lembretes:{agua:{on:true,min:90},refeicoes:{on:false,horas:['08:00']},humor:{on:false,hora:'21:00'},fin:{on:false}},notif:true}};
store[X.CHAVE]=JSON.stringify(v1);
const m=X.migrar(JSON.parse(JSON.stringify(v1)));
t('v1 migra direto para o esquema atual', m.v===X.ESQUEMA, m.v);
t('perfil preservado', m.perfil.nome==='Fulana' && m.perfil.meta===2000);
t('bloco de rotina preservado', m.rotina.blocos.length===1 && m.rotina.blocos[0].id==='b1');
t('marcação de feito preservada', m.rotina.feitos['2026-01-10'][0]==='b1');
t('refeição preservada', m.alim.reg['2026-01-10'][0].kcal===128);
t('água preservada', m.agua['2026-01-10']===1500);
t('gasto preservado', m.fin.gastos[0].valor===80);
t('lembrete de água preservado', m.cfg.lembretes.agua.min===90);
t('módulos criados', m.modulos && m.modulos.rotina===true);
t('quem já usava medicamento continua com o módulo ligado', m.modulos.meds===true);
t('sono desligado por padrão (não usava)', m.modulos.sono===false);
t('tema padrão automático', m.cfg.tema==='auto');
t('backup pré-migração foi guardado', !!store[X.CHAVE+'.backup.v1']);
t('backup contém o dado original', JSON.parse(store[X.CHAVE+'.backup.v1']).perfil.nome==='Fulana');

console.log('\n— MIGRAÇÃO É IDEMPOTENTE —');
const m2=X.migrar(JSON.parse(JSON.stringify(m)));
t('migrar duas vezes não muda nada', JSON.stringify(m2)===JSON.stringify(m));

console.log('\n— MESCLA PROFUNDA (campo novo não apaga o antigo) —');
const base={a:1,b:{c:2,d:3},e:[1,2]};
const r=X.mesclar(base,{b:{c:9},f:7});
t('campo novo entra', r.f===7);
t('campo existente é sobrescrito', r.b.c===9);
t('irmão não citado sobrevive', r.b.d===3);
t('array é substituído inteiro, não mesclado', JSON.stringify(r.e)==='[1,2]');

console.log('\n— PROVENIÊNCIA DA BASE NUTRICIONAL —');
t('fonte tem nome', !!X.TACO_FONTE.nome);
t('fonte tem versão', /4ª edição/.test(X.TACO_FONTE.versao));
t('fonte tem url oficial', X.TACO_FONTE.url.includes('nepa.unicamp.br'));
t('fonte tem data de consulta', /^\d{4}-\d{2}-\d{2}$/.test(X.TACO_FONTE.consultado));
t('base declara unidade', /100 g/.test(X.TACO_FONTE.base));
t('591 alimentos carregados', X.TACO.f.length===591, X.TACO.f.length);

console.log('\n— MÓDULOS —');
t('todos os módulos têm id, nome e descrição', X.MODULOS.every(m=>m.id&&m.nome&&m.desc));
t('rotina é fixa', X.MODULOS.find(m=>m.id==='rotina').fixo===true);


/* ================= LOTE 2 ================= */
console.log('\n— MIGRAÇÃO v2 → v3 —');
{
  // fixture legítimo de v2: como o app salvava antes deste lote
  const v2=JSON.parse(JSON.stringify(m));
  v2.v=2;
  delete v2.ativ; delete v2.compras; delete v2.cabelo;
  delete v2.alim.barcode; delete v2.perfil.estrategiaGasto;
  v2.fin.gastos=[{desc:'x',val:100,cat:'Mercado',data:'2026-02-01',tag:''}];
  const r=X.migrar(v2);
  t('esquema vira 3', r.v===3, r.v);
  t('gasto antigo ganhou id', !!r.fin.gastos[0].id);
  t('gasto antigo ganhou campo de parcela nulo', r.fin.gastos[0].parc===null);
  t('valor do gasto intacto', r.fin.gastos[0].val===100);
  t('compras criado vazio', Array.isArray(r.compras.listas) && r.compras.listas.length===0);
  t('atividade criada vazia', !!r.ativ && typeof r.ativ.reg==='object');
  t('cabelo criado vazio', r.cabelo.etapas.length===0 && r.cabelo.perfil===null);
  t('estratégia de gasto padrão evita dupla contagem', r.perfil.estrategiaGasto==='fator');
  t('cache de código de barras criado', typeof r.alim.barcode==='object');
  t('backup da v2 guardado', !!store[X.CHAVE+'.backup.v2']);
  t('migração v2→v3 é idempotente', JSON.stringify(X.migrar(JSON.parse(JSON.stringify(r))))===JSON.stringify(r));
}

console.log('\n— GASTO DE ATIVIDADE (MET) —');
{
  const g=globalThis.__x2.gastoAtividade;
  // MET × 3,5 × peso / 200 × min  — caso conhecido: 60kg, 30min, MET 8 => 252 kcal
  t('60 kg, 30 min, MET 8 ≈ 252 kcal', g(8,60,30)===252, g(8,60,30));
  // caminhada MET 3.0, 70kg, 60min => 220.5 -> 221 (tolerância de arredondamento)
  t('70 kg, 60 min, MET 3 ≈ 221 kcal', Math.abs(g(3,70,60)-220.5)<=0.5, g(3,70,60));
  t('sem peso não inventa número', g(8,null,30)===null);
  t('sem duração não inventa número', g(8,60,0)===null);
  t('dobrar a duração dobra o gasto', g(6,60,60)===g(6,60,30)*2);
  const mets=globalThis.__x2.METS;
  t('todos os METs têm valor positivo', mets.every(x=>x.met>0));
  t('fonte dos METs declarada com versão', /2024/.test(globalThis.__x2.MET_FONTE.versao));
}

console.log('\n— NUTRIENTES: AUSÊNCIA NÃO É ZERO —');
{
  const N=globalThis.__x2.NUTRIENTES;
  t('resumo tem os cinco básicos', N.filter(n=>n.grupo==='resumo').length===5);
  t('todo nutriente declara unidade', N.every(n=>!!n.un));
  t('existe grupo de micronutrientes', N.some(n=>n.grupo==='micro'));
}

console.log('\n— PARCELAS COMPROMETIDAS —');
{
  const S2=globalThis.__x2.S;
  S2.fin.gastos=[{id:'g1',desc:'sofá',val:1200,cat:'Outros',data:'2026-01-15',tag:'',parc:{total:6}}];
  const pc=globalThis.__x2.parcelasComprometidas;
  t('mês da compra não conta de novo', pc('2026-01')===0);
  t('mês seguinte conta uma parcela', Math.abs(pc('2026-02')-200)<0.01, pc('2026-02'));
  t('último mês da série ainda conta', Math.abs(pc('2026-06')-200)<0.01);
  t('depois do fim não conta mais', pc('2026-07')===0);
  S2.fin.gastos=[];
}

console.log('\n— INSIGHTS SÓ COM AMOSTRA —');
{
  const S2=globalThis.__x2.S, gi=globalThis.__x2.gerarInsights;
  S2.modulos={rotina:true,comida:true,agua:true,dinheiro:true,bem:true,meds:true,sono:true,ativ:true,compras:false,progresso:true,cabelo:false};
  S2.sono={reg:{}}; S2.ativ={reg:{}}; S2.agua={}; S2.alim.reg={}; S2.fin.gastos=[]; S2.bem.humor=[]; S2.rotina.blocos=[];
  t('sem dado nenhum, nenhuma observação é inventada', gi().length===0, gi().length);
  // 3 noites: abaixo do mínimo de 5
  const hj=new Date().toISOString().slice(0,10);
  const menos=(iso,n)=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()-n);return d.toISOString().slice(0,10);};
  for(let i=0;i<3;i++) S2.sono.reg[menos(hj,i)]={horas:7,min:0};
  t('3 noites ainda não geram média', !gi().some(x=>/sono/.test(x.texto)));
  for(let i=3;i<6;i++) S2.sono.reg[menos(hj,i)]={horas:7,min:0};
  const comSono=gi().find(x=>/sono/.test(x.texto));
  t('6 noites geram média', !!comSono);
  t('a observação declara a base usada', comSono && /6 noites/.test(comSono.base));
  t('a observação não afirma causa', comSono && !/porque|causa|por isso/i.test(comSono.texto+comSono.base));
}

console.log('\n— LINGUAGEM: SEM CULPA —');
{
  const html=fs.readFileSync('app.html','utf8');
  const proibidas=['você falhou','você fracassou','preguiça','meta não cumprida','você excedeu','você deveria','descontrole'];
  const achadas=proibidas.filter(w=>html.toLowerCase().includes(w));
  t('nenhum termo de culpa no app', achadas.length===0, achadas.join(', '));
  t('afirma que o gasto é estimado', /estimad/.test(html));
  t('usa "não informado" para ausência', html.includes('não informado'));
  t('registro ausente não vira esquecimento', html.includes('sem registro'));
}


/* ================= FASE 8 ================= */
console.log('\n— NUVEM DORMENTE SEM CONFIGURAÇÃO —');
{
  const cfg=fs.readFileSync('config.js','utf8');
  t('config não traz URL preenchida', /SUPABASE_URL:\s*""/.test(cfg));
  t('config não traz chave preenchida', /SUPABASE_ANON_KEY:\s*""/.test(cfg));
  const nv=fs.readFileSync('nuvem.js','utf8');
  t('nuvem só liga se os dois campos existirem', /LIGADO\s*=\s*!!\(C\.SUPABASE_URL && C\.SUPABASE_ANON_KEY\)/.test(nv));
  t('nenhuma chave de exemplo vazou no código', !/eyJ[A-Za-z0-9_-]{20,}/.test(nv+cfg));
  // a palavra aparece no aviso de config.js; o que não pode é ela estar atribuída a algo
  t('service_role só aparece como aviso, nunca atribuída', !/service_role\s*[:=]\s*["'`]/.test(nv+cfg));
  t('o aviso contra service_role existe', /NUNCA cole aqui a service_role/.test(cfg));
  t('escopos mínimos no login', /scopes:\s*"openid email profile"/.test(nv));
  t('não pede Gmail, Drive ou agenda', !/gmail|drive|calendar|contacts/i.test(nv));
}

console.log('\n— RLS EM TODA TABELA —');
{
  const sql=fs.readFileSync('supabase/schema.sql','utf8');
  const criadas=[...sql.matchAll(/create table if not exists public\.(\w+)/g)].map(x=>x[1]);
  const listadas=(sql.match(/foreach t in array array\[([\s\S]*?)\]/)||[])[1]||'';
  const semRls=criadas.filter(t=>!listadas.includes("'"+t+"'"));
  t('toda tabela criada está na lista de RLS', semRls.length===0, semRls.join(', '));
  t('RLS é forçado, não só habilitado', /force row level security/.test(sql));
  t('policy de leitura compara auth.uid()', /for select using \(auth\.uid\(\) = user_id\)/.test(sql));
  t('policy de escrita valida with check', /with check \(auth\.uid\(\) = user_id\)/.test(sql));
  t('as quatro operações têm policy', ['for select','for insert','for update','for delete'].every(o=>sql.includes(o)));
  t('dinheiro em centavos inteiros', /valor_centavos integer/.test(sql) && !/valor.*float|valor.*real\b/.test(sql));
  t('exclusão de conta é security definer', /apagar_minha_conta[\s\S]*security definer/.test(sql));
  t('função de exclusão não é pública', /revoke all on function public\.apagar_minha_conta/.test(sql));
  t('cascade limpa os dados ao apagar usuário', (sql.match(/on delete cascade/g)||[]).length>=20);
}

console.log('\n— FILA OFFLINE IDEMPOTENTE —');
{
  const nv=fs.readFileSync('nuvem.js','utf8');
  t('chave da fila é tabela:id', /chave: tabela \+ ":" \+ \(linha\.id/.test(nv));
  t('reenvio substitui em vez de acumular', /objectStore\(LOJA\)\.put/.test(nv));
  t('upsert usa conflito por id', /onConflict: "id"/.test(nv));
  t('troca de conta limpa a fila', /clear\(\)/.test(nv));
  t('sincroniza ao voltar a conexão', /addEventListener\("online"/.test(nv));
}

console.log('\n— SERVICE WORKER —');
{
  const sw=fs.readFileSync('sw.js','utf8');
  t('cache versionado', /const CACHE = "muse-v\d+"/.test(sw));
  t('não guarda resposta de terceiros', /url\.origin !== location\.origin/.test(sw));
  t('HTML busca a rede antes do cache', /req\.mode === "navigate"[\s\S]{0,120}fetch\(req\)/.test(sw));
  t('atualiza só quando a pessoa aceita', /tipo === "assumir"/.test(sw));
  const html=fs.readFileSync('app.html','utf8');
  t('app não recarrega sozinho ao atualizar', /nunca recarrega sozinho/.test(html));
}

console.log('\n— ACESSIBILIDADE —');
{
  const html=fs.readFileSync('app.html','utf8');
  t('modal declara papel de diálogo', /aria-modal", "true"/.test(html));
  t('Esc fecha o modal', /e\.key === "Escape"/.test(html));
  t('foco fica preso no modal', /e\.key !== "Tab"/.test(html));
  t('foco volta para onde estava', /antes\.focus\(\)/.test(html));
  t('respeita prefers-reduced-motion', /prefers-reduced-motion/.test(html));
}

console.log('\n— NOTIFICAÇÃO: PRIVACIDADE —');
{
  const html=fs.readFileSync('app.html','utf8');
  t('janela silenciosa é respeitada', /if \(dentroDaJanelaSilenciosa\(\)\) return;/.test(html));
  t('conteúdo privado por padrão', /conteudoPrivado: false/.test(html));
  t('nome do medicamento não vai no corpo', /Um registro de medicamento está previsto/.test(html));
  t('app não promete alarme infalível', /Não são alarme/.test(html));
}


console.log('\n— IDS ACEITOS PELO BANCO (regressão) —');
{
  const nv=fs.readFileSync('nuvem.js','utf8');
  const src=nv.match(/function hashId\(txt\)[\s\S]*?\n  }/)[0];
  const hashId = eval("(" + src.replace("function hashId", "function") + ")");
  const RE=/^d[0-9a-f]{32}$/;
  const casos=["agua2026-08-25","sono2026-01-02","orcMercado","humor2026-12-31","cab H"];
  t('todo hashId tem formato estável', casos.every(c=>RE.test(hashId(c))));
  t('hashId é determinístico', hashId("agua2026-08-25")===hashId("agua2026-08-25"));
  t('entradas próximas geram ids diferentes', hashId("agua2026-08-25")!==hashId("agua2026-08-26"));
  const set=new Set(); for(let i=0;i<100000;i++) set.add(hashId("k"+i));
  t('sem colisão em 100 mil chaves', set.size===100000, 100000-set.size);

  const sql=fs.readFileSync('supabase/schema.sql','utf8');
  t('coluna id aceita id do cliente (text)', /id text primary key/.test(sql));
  t('nenhuma coluna de id exige uuid', !/\bid \w*uuid primary key/.test(sql));
  t('referências entre registros também são text', /lista_id text not null references/.test(sql));
  t('user_id continua uuid ligado ao auth', /user_id uuid[\s\S]*references auth\.users/.test(sql));
}


console.log('\n— DESCOBERTA DOS MÓDULOS —');
{
  const html=fs.readFileSync('app.html','utf8');
  t('menu Mais lista módulos desligados também', /desligado — toque para ligar/.test(html));
  t('Mais tem cronograma capilar mesmo desligado', /id: "cabelo", nome: "Cronograma capilar"/.test(html));
  t('rotina tem atalho para cronograma capilar', /id="rtCabelo"/.test(html));
  t('rotina tem atalho para lista de compras', /id="rtCompras"/.test(html));
  t('rotina tem painel de todos os módulos', /id="rtModulos"/.test(html));
  t('ligar módulo pergunta antes', /function garantirModulo/.test(html));
  t('ligar não preenche dado por conta própria', /nada é preenchido por você/.test(html));
  t('desligar dentro do módulo devolve para Hoje', /volta para Hoje/.test(html));
}

console.log('\n— ENTRADA ANTES DO PERFIL —');
{
  const html=fs.readFileSync('app.html','utf8');
  t('tela de entrada existe', /id="onbConta"/.test(html));
  t('entrada vem antes do onboarding', html.indexOf('id="onbConta"') < html.indexOf('id="onb"'));
  t('bootstrap chama a entrada, não o perfil', /else abrirEntrada\(\);/.test(html));
  t('oferece entrar com Google', /id="enGoogle"/.test(html));
  t('oferece continuar local', /id="enLocal"/.test(html));
  t('explica que não pede Drive nem agenda', /nunca Gmail, Drive, agenda ou contatos/.test(html));
  t('sem conta configurada não vira beco sem saída', /Começar sem conta/.test(html));
  t('backup pode ir para onde a pessoa quiser', /function compartilharBackup/.test(html));
  t('backup usa compartilhamento nativo quando existe', /navigator\.canShare\(\{ files/.test(html));
  t('backup tem plano B se não houver compartilhamento', /Arquivo salvo em Downloads/.test(html));
}

console.log('\n'+(fail?'✗ '+fail+' falha(s), ':'')+ok+' teste(s) passaram.');
process.exit(fail?1:0);
