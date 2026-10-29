# Dota Assistente (MVP)

Avisos de voz em português para runas, lótus, Tormentor e dia/noite no Dota 2.

Usa só a **Game State Integration (GSI)**, a API oficial da Valve: o próprio jogo envia o relógio da partida
para este app. Nada de ler memória, injetar código ou desenhar na tela.

Requisitos: Windows, Node 18+ e uma voz pt-BR instalada (a "Microsoft Maria" já vem no Windows em português).
Não há dependências para instalar.

## Como usar

1. Criar o arquivo de configuração da GSI na pasta do Dota (só uma vez):
   ```
   npm run install-cfg
   ```
   Se não achar a pasta: `npm run install-cfg -- --dir="D:\SteamLibrary\steamapps\common\dota 2 beta"`

2. Na Steam: Dota 2 > Propriedades > Opções de inicialização, adicionar `-gamestateintegration`.

3. Abrir o assistente antes de jogar:
   ```
   npm start
   ```

   No **modo Turbo**, use `npm run start:turbo` (lótus a cada 90 s e Tormentor mais cedo).
   Para deixar o Turbo como padrão, coloque `"mode": "turbo"` em `config/app.json`.

4. Para testar sem o jogo, em outro terminal: `npm run simulate -- --speed=10`

## Sons

Cada evento toca um som curto (moedas para recompensa, bolhas para água, sinos para sabedoria...).
Os sons em `sounds/` são **originais, sintetizados por código** (`npm run generate-sounds`); nada vem do jogo.

- Ouvir todos: `npm run test-sounds`
- Trocar um som: coloque seu `.wav` ou `.mp3` e aponte o campo `sound` do evento em `config/timers.json`.
- Sem o campo `sound` (ou se o arquivo não existir), o evento é avisado por voz.

## Configuração

- `config/timers.json`: eventos, horários, antecedência (`lead`) e liga/desliga. **Os tempos mudam com os patches.
  Confira as notas do patch atual.**
- `config/app.json`: porta, token, voz, velocidade (`rate`, de -10 a 10) e volume.

## Descobrir o que a GSI envia

`npm run start:record` grava cada pacote recebido em `logs/`. Use numa partida de bots e numa ranqueada para ver
quais campos chegam em cada modo.
