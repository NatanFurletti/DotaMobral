# DotaMobral

Avisos sonoros para Dota 2: runas, lótus e Tormentor, alguns segundos antes de aparecerem.
Modos **Normal** e **Turbo**, com interface simples no navegador.

## ⬇️ Quero só usar

Baixe o **`DotaMobral.exe`** em [Releases](https://github.com/NatanFurletti/DotaMobral/releases/latest)
e siga o guia **[COMO-INSTALAR.md](COMO-INSTALAR.md)**. Não precisa instalar mais nada.

## É seguro? Dá ban?

O DotaMobral usa apenas a **Game State Integration (GSI)**, a integração oficial que a própria Valve
oferece: o jogo envia o relógio da partida para o programa, no seu computador.

- Não lê a memória do jogo, não injeta código e não desenha nada na tela.
- Não mostra informação escondida (posição de inimigos etc.): só faz as contas de tempo que o
  jogador faria de cabeça.
- Nada sai do seu computador: a interface roda em `http://127.0.0.1`.

**Sua lane:** no tempo de estratégia (draft já terminado; reserva: pré-jogo), o app captura **uma vez** só a faixa da barra superior (os 10 retratos que
todos os jogadores veem) e reconhece os heróis no próprio PC, comparando com os retratos oficiais.
Nunca o minimapa, nunca durante a partida. Com isso estima posições, seu duo, os inimigos da lane,
o confronto (estatísticas públicas do OpenDota) e itens úteis. Dá para desligar e corrigir tudo na página.

Os sons são **originais, sintetizados por código** (`scripts/generate-sounds.js`). Nada vem do jogo.

---

## Para desenvolvedores

Requisitos: Windows e Node 22+. Sem dependências em tempo de execução.

```
npm install          # só ferramentas de build (esbuild, postject)
npm start            # assistente + interface em http://127.0.0.1:3000
npm run start:turbo  # já começa no modo Turbo
npm run simulate -- --speed=10   # simula uma partida (em outro terminal)
npm run build        # gera dist/DotaMobral.exe
```

Outros comandos: `npm run test-sounds`, `npm run generate-sounds`, `npm run install-cfg`,
`npm run start:record` (grava os pacotes da GSI em `logs/`, que tem seu Steam ID e fica fora do git).

### Estrutura

| Caminho | O que é |
|---|---|
| `src/server.js` | Servidor: recebe a GSI, toca os avisos e serve a interface/API |
| `src/timers.js` | Calcula quando avisar cada evento a partir do relógio do jogo |
| `src/speaker.js` | Voz (System.Speech) e sons (winmm) do Windows, via PowerShell |
| `src/settings.js` | Preferências do usuário em `%APPDATA%\DotaMobral\settings.json` |
| `src/gsi-cfg.js` | Instala o `.cfg` da GSI na pasta do Dota e verifica a opção da Steam |
| `src/capture.js` | Captura só a faixa da barra superior (.NET/PowerShell) |
| `src/recognize.js` | Reconhece os 10 retratos (calibra sozinho a partir do seu herói) |
| `src/lanes.js`, `src/advice.js` | Posições prováveis, confronto da lane e itens úteis |
| `src/match.js` | Quando ler (pré-jogo, uma vez) e estado da partida |
| `config/hero-traits.json` | Heróis com invisibilidade, cura, ilusões etc. (revisar a cada patch) |
| `ui/index.html` | Interface |
| `config/timers.json`, `config/timers-turbo.json` | Tempos de cada modo (**mudam com os patches**) |
| `scripts/build.js` | Empacota tudo num `.exe` (Node Single Executable Applications) |

### Campos de evento (`config/timers*.json`)

`first` + `interval` (repete), `times` (horários fixos), `last` (não avisa depois disso),
`lead` (segundos de antecedência), `sound` (arquivo .wav/.mp3) ou `say` (palavra falada).

---

DotaMobral não é afiliado à Valve. Dota 2 é marca registrada da Valve Corporation.
