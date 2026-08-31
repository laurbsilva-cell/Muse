# muse. — publicar e instalar

Você tem 12 arquivos. Todos precisam ficar **na mesma pasta**, sem subpastas:

```
index.html                 ← a landing page (o site)
app.html                   ← o aplicativo
privacidade.html           ← política de privacidade
manifest.json
sw.js
logo.png                   ← wordmark, usado no site e no app
og.png                     ← preview ao compartilhar o link
icon-192.png
icon-512.png
icon-maskable-512.png
apple-touch-icon.png
```

Depois de publicado:

- `https://SEU-USUARIO.github.io/muse/` abre a **landing page**
- `https://SEU-USUARIO.github.io/muse/app.html` abre o **aplicativo**
- o botão "abrir muse." e todos os CTAs do site levam para o app
- ao instalar na tela inicial, o ícone abre direto no app, não no site

---

## 1. Publicar no GitHub Pages

1. Entre em github.com e crie uma conta, se ainda não tiver.
2. Clique em **New repository**.
3. Nome: `muse`. Marque **Public**. Não marque "Add a README". Clique em **Create repository**.
4. Na tela que abrir, clique em **uploading an existing file**.
5. Arraste os 12 arquivos de uma vez. Espere terminar de subir.
6. Clique em **Commit changes** (botão verde, embaixo).
7. Vá em **Settings** (no menu de cima do repositório) → **Pages** (menu da esquerda).
8. Em "Source", escolha **Deploy from a branch**. Em "Branch", escolha **main** e a pasta **/ (root)**. Clique em **Save**.
9. Espere de 1 a 3 minutos e recarregue a página. Vai aparecer o endereço:
   `https://SEU-USUARIO.github.io/muse/`

Esse é o link do seu app. Guarde.

> Precisa ser HTTPS para o app funcionar offline e mandar notificação. O GitHub Pages já entrega HTTPS.

**Para atualizar depois:** entre no repositório, clique em **Add file → Upload files**, suba o arquivo novo com o mesmo nome e faça commit. No celular, feche e abra o app — a versão nova entra sozinha.

---

## 2. Instalar no iPhone

1. Abra o link **no Safari**. Não funciona pelo Chrome no iPhone.
2. Toque no botão de compartilhar (o quadrado com a seta para cima, embaixo).
3. Role e toque em **Adicionar à Tela de Início**.
4. Confirme o nome "muse." e toque em **Adicionar**.
5. Feche o Safari e abra o app pelo ícone. Ele abre em tela cheia, sem barra de navegador.

**Notificações no iPhone:** só funcionam depois que o app está na tela de início (iOS 16.4 ou mais novo). Abra o app pelo ícone, vá em **Config → Lembretes → Ligar notificações** e aceite.

---

## 3. Instalar no Android

1. Abra o link no **Chrome**.
2. Deve aparecer uma faixa "Instalar app". Se não aparecer, toque nos três pontinhos (canto superior direito) → **Instalar aplicativo** ou **Adicionar à tela inicial**.
3. Confirme.
4. Abra pelo ícone e ligue as notificações em **Config → Lembretes**.

---

## 4. Primeiras coisas a fazer dentro do app

1. Preencha o onboarding (nome, corpo, atividade, objetivo). Ele mostra a conta inteira antes de salvar.
2. **Config → Contatos de confiança** — cadastre pelo menos um nome e telefone.
3. **Config → Lembretes** — ligue as notificações e escolha os horários.
4. **Dinheiro → Renda** — cadastre a renda para os painéis funcionarem.
5. **Config → Backup → Exportar** — faça isso de vez em quando. É a única cópia dos seus dados.

---

## Sobre os dados

Tudo fica no `localStorage` do navegador, no seu aparelho. Não existe servidor, conta nem sincronização.

Isso significa duas coisas:

- Ninguém além de você vê o que está lá.
- Se você limpar os dados do navegador, desinstalar o app ou trocar de celular, **os dados vão embora**. O backup em JSON é a forma de levá-los.

---

## Sobre as notificações

O app agenda os lembretes enquanto está aberto ou em segundo plano. Sem servidor de push, o sistema operacional pode encerrar os timers quando o aparelho fica muito tempo sem abrir o app — nesse caso, o lembrete aparece dentro do app assim que você abre, como aviso de pendência. É a limitação real de um PWA sem backend, e o app deixa isso claro na tela de configurações.

---

## Base de alimentos

Já vêm **591 alimentos da Tabela TACO, 4ª edição (NEPA/Unicamp)**, com energia, proteína, carboidrato, lipídeo e fibra por 100 g — extraídos direto da planilha que você mandou, sem valor inventado.

Para acrescentar mais, use **Config → Base de alimentos → Importar CSV**. O importador aceita cabeçalhos com as palavras `nome`/`descrição`, `kcal`/`energia`, `proteína`, `carboidrato` e `lipídeo`/`gordura`, com vírgula ou ponto e vírgula como separador.
