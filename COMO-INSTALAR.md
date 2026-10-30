# 🎮 Como instalar o DotaMobral

O DotaMobral toca sons e avisos **antes** das runas, da lótus e do Tormentor aparecerem no Dota 2.

- Usa a integração **oficial** da Valve (Game State Integration). Não mexe no jogo, não lê a memória e não mostra nada na tela: **não dá ban**.
- Não precisa instalar nada além dele mesmo. São dois cliques.
- Funciona no **Windows**.

---

## 1. Baixar

1. Abra a página de downloads: **https://github.com/NatanFurletti/DotaMobral/releases/latest**
2. Em **Assets**, clique em **`DotaMobral.exe`** para baixar.
3. **O navegador provavelmente vai "segurar" o arquivo** (veja abaixo como liberar).
4. (Recomendado) Mova o arquivo da pasta **Downloads** para **Documentos**.

### O navegador bloqueou o download?

Isso é normal: os navegadores desconfiam de qualquer programa novo e pouco baixado.
Se na pasta Downloads aparecer um arquivo com nome estranho, como
**`Não confirmado 123456.crdownload`**, o download **não terminou**: ele está esperando você
confirmar. Não abra nem renomeie esse arquivo; libere pelo navegador:

**Google Chrome**
1. Aperte **Ctrl+J** (abre a página de Downloads).
2. No **DotaMobral.exe**, clique em **Manter**.
   Se não houver o botão, clique nos **três pontinhos ⋮** ao lado do arquivo e escolha
   **Manter** / **Fazer download de arquivo suspeito**.
3. Se pedir confirmação de novo, clique em **Manter mesmo assim**.

**Microsoft Edge**
1. Aperte **Ctrl+J** (abre o painel de Downloads).
2. Passe o mouse no **DotaMobral.exe**, clique nos **três pontinhos ...** e em **Manter**.
3. Clique em **Mostrar mais** → **Manter mesmo assim**.

Quando der certo, o arquivo aparece na pasta Downloads com o nome **`DotaMobral.exe`**.
Se o arquivo travado (`.crdownload`) continuar lá, pode apagar.

> Ainda não funcionou? Tente baixar por outro navegador (Edge, se estava no Chrome, ou o
> contrário).

## 2. Abrir

1. Dê **dois cliques** no `DotaMobral.exe`.
2. **Na primeira vez**, o Windows pode mostrar uma tela azul dizendo **"O Windows protegeu o computador"**.
   Isso acontece com qualquer programa novo que não tem assinatura digital paga. Para continuar:
   clique em **Mais informações** → **Executar assim mesmo**.
3. Vão abrir **duas coisas**:
   - uma **janela preta**: é o assistente funcionando. **Não feche** (pode minimizar);
   - uma **página no navegador** com os botões do DotaMobral.

Você vai ouvir: **"Assistente de Dota pronto"**.

## 3. Configurar o Dota (só na primeira vez)

Na página do DotaMobral, na parte **"Configuração do Dota"**:

1. Clique em **Configurar Dota**. O passo 1 fica com um ✓ verde.
2. Faça o passo 2 na **Steam**:
   - clique com o **botão direito** em **Dota 2** → **Propriedades**;
   - na aba **Geral**, em **Opções de inicialização**, cole o texto `-gamestateintegration`
     (o botão **Copiar** da página copia para você);
   - feche a janela de Propriedades.
3. Abra o Dota 2 (se já estava aberto, **feche e abra de novo**).

## 4. Jogar

1. Abra o **DotaMobral.exe** **antes** de entrar na partida.
2. Na página, escolha **Normal** ou **Turbo**, conforme o modo que for jogar.
3. Quando a partida começar, o indicador no topo da página fica **verde: "Dota conectado"**.
4. Pronto! Os sons tocam sozinhos, uns segundos antes de cada evento.

### Sua lane (heróis da partida)

No **tempo de estratégia** (logo depois que os 10 heróis foram escolhidos), o DotaMobral lê os
heróis na barra superior e mostra na página: seu duo, os inimigos prováveis da sua lane, se o
confronto tende a ser favorável ou não (e por quê) e itens úteis para aquela partida.

Na primeira vez que abrir, ele baixa os retratos oficiais dos heróis (uns 8 MB); a janela preta
mostra **"Reconhecimento de heróis pronto"** quando terminar.

- Para funcionar, use o Dota em **Janela sem bordas** (Configurações → Vídeo → Modo de exibição).
  Em tela cheia o Windows pode devolver a captura preta.
- Se o seu herói joga em duas posições (ex.: Witch Doctor 4 ou 5), aparecem botões para você
  escolher com um clique. Em **"Outras disposições da lane"** há cenários prontos (você + duo contra
  outra dupla inimiga), também com um clique.
- A seção **Build** mostra, com ícones, os itens de lane (baratos), os de meio/fim de jogo e a ordem
  de skills. Itens com borda amarela foram escolhidos contra a partida (passe o mouse para ver o porquê).
- Se algum herói vier errado, corrija em **"Os 10 heróis"**, ou clique em **"Ler heróis agora"**
  para ler de novo (suas correções são mantidas). Se a posição estimada não for a sua, escolha em
  **"Minha posição"**.
- Na primeira partida ele calibra a tela e pode ler só no pré-jogo; da segunda em diante, já no
  tempo de estratégia.
- A leitura só acontece com os 10 heróis já escolhidos (nunca durante a escolha) e usa só a barra
  superior, que todos os jogadores veem. Pode ser desligada na própria página.

### Ouro por minuto

Na parte **Partida**, a partir dos 5 minutos, uma barra mostra se você está **farmando pouco, na média
ou bem** comparado com as partidas do seu herói. No Turbo aparece só o número (a referência é de
partidas normais).

Na página também dá para:
- mudar o **volume** dos sons e da voz;
- **ligar/desligar** cada aviso e escolher **quantos segundos antes** ele toca;
- clicar em **▶ Testar sons** para ouvir todos.

Suas escolhas ficam salvas para a próxima vez.

---

## 🔄 Atualizar para uma versão nova

A versão aparece no topo da página do DotaMobral (ex.: **v0.3.0**). A mais recente fica sempre em
**https://github.com/NatanFurletti/DotaMobral/releases/latest**.

1. Baixe o **`DotaMobral.exe`** novo pelo mesmo link (passo 1).
2. **Apague o `DotaMobral.exe` antigo** (ou substitua o arquivo, se salvou na mesma pasta).
   Se ficar com os dois, é fácil abrir o antigo sem querer.
3. Dê dois cliques no novo. Se o antigo ainda estiver aberto, a versão nova (0.3.0 em diante) fecha
   o antigo sozinha. Vindo da **0.2.0**, feche antes a janela preta da versão antiga.
4. Confira no topo da página se aparece o número da versão nova.

Não precisa configurar o Dota de novo: suas configurações e a calibração continuam valendo.

---

## ❓ Problemas comuns

| O que aconteceu | O que fazer |
|---|---|
| Na pasta Downloads só tem um arquivo `.crdownload` ("Não confirmado...") | O navegador está segurando o download. Veja **"O navegador bloqueou o download?"** no passo 1. |
| Baixei a versão nova, mas a página mostra a antiga | Você abriu o arquivo antigo, ou o antigo ainda estava aberto. Feche todas as janelas pretas, apague o `.exe` antigo e abra o novo. Veja **"Atualizar para uma versão nova"**. |
| "Sua lane" diz que a captura saiu preta | O Dota está em tela cheia. Mude para **Janela sem bordas** (Configurações → Vídeo). |
| Fechei a página do navegador sem querer | Dê dois cliques no `DotaMobral.exe` de novo: ele só reabre a página. |
| O indicador nunca fica verde | Confira o passo 2 (opção na Steam) e **reinicie o Dota**. Os avisos só começam quando a partida carrega. |
| "Não encontrei a pasta do Dota" | Aparece um campo para colar a pasta. Na Steam: botão direito em Dota 2 → **Gerenciar** → **Ver arquivos locais**. Copie o endereço da janela que abrir e cole no campo. |
| A voz fala com sotaque americano | Seu Windows não tem a voz em português. Vá em **Configurações → Hora e idioma → Fala → Adicionar vozes → Português (Brasil)**. |
| O antivírus bloqueou o arquivo | Programas novos e sem assinatura às vezes são bloqueados por engano. O código é aberto e pode ser conferido neste repositório. Se confiar, libere o arquivo no antivírus. |
| Quero fechar o assistente | Feche a janela preta ou clique em **Sair** na página. |

---

DotaMobral não é afiliado à Valve. Dota 2 é marca registrada da Valve Corporation.
