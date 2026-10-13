# worship-stage-fx

Aplicativo PWA de Pads e Efeitos Worship para teclado Roland Juno-Stage.
Versão definitiva: **Hollow Space Pad com Glide + 16 Worship FX + carregador de samples + 100% offline**.

App publicado: <https://yohann123c-hash.github.io/worship-stage-fx/>

---

## 🎛️ Colchão de Adoração — Hollow Space Pad com Glide

| Recurso | Implementação |
|---|---|
| Corpo oco e aveludado | 2 osciladores **Sine** (detune ±7 cents) + 1 **Triangle** uma oitava abaixo |
| Filtro de 320 Hz | `lowpass` 320 Hz + `notch` 620 Hz (escava o médio) + `bandpass` 320 Hz em paralelo |
| Movimento espacial | LFO de **0.2 Hz** (±110 Hz no filtro), pan lento 0.05 Hz e coro de detune 0.09 Hz |
| **Glide / portamento 1.5s** | Trocar de nota **não recria osciladores**: apenas `osc.frequency.linearRampToValueAtTime(novaFreq, now + 1.5)` |
| Envelope | Attack **1.8s** (fade-in) e Release **1.5s** (fade-out ao desligar) |
| Sem estalos | `cancelAndHoldAtTime` antes de cada rampa e micro-fade no STOP ALL |

Toque em uma nota (ex.: **C**) e depois em outra (ex.: **G**): o som **desliza** de uma
para a outra em 1,5 s, sem cortes. Tocar duas vezes na mesma nota desliga o colchão
com o fade-out de 1,5 s.

## 🥁 Os 16 Worship FX / Drums / Motion Pads

1. **Sub Drop 808** — impacto grave profundo no tempo 1
2. **Worship Snare + Reverb** — caixa de louvor encorpada
3. **Clap Cathedral** — palmas duplas com reverb longo
4. **Snap Reverb** — estalo de dedos seco com ambiente
5. **Swell Riser** — whoosh crescendo de subida
6. **Reverse Crash** — prato invertido para transição/sugada
7. **White Noise Sweep** — ruído de ar contínuo
8. **Shaker / Pandeiro** — percussão de ritmo (colcheias a 120 BPM)
9. **Shimmer Pad Stab** — ataque brilhante uma oitava acima
10. **Pluck Delay Synth** — sintetizador staccato com eco
11. **Pulse Pad** — pulso rítmico em colcheias
12. **Chimes Celestial** — sino harmônico longo
13. **Whoosh Passage** — transição rápida de estrofe
14. **War Cry / Vinho Novo** — grito de celebração (formantado, sem estridência)
15. **Applause Congregação** — aplausos atmosféricos
16. **Ambient Swell** — efeito espacial

Toda a síntese é nativa (Web Audio API), com compressor suave na saída e reverb de
ambiente gerado por convolução — nada de timbres metálicos ou estridentes.

## 📁 Samples próprios (.wav / .mp3)

- Cada pad tem um botão **📁** discreto no canto superior direito.
- Toque nele para abrir o seletor de arquivos do celular/PC (`accept="audio/*"`).
- O áudio é decodificado (`decodeAudioData`) e **substitui a síntese** daquele pad:
  a borda fica **verde (#10b981)** e o nome do arquivo é guardado.
- Os áudios importados são salvos no **IndexedDB** do navegador e recarregam
  automaticamente — mesmo offline, mesmo depois de fechar o app.
- Para voltar à síntese, **segure o 📁** por ~1 segundo.

## 📲 PWA instalável e 100% offline

- Meta tags de PWA (`theme-color #0d0e15`, `mobile-web-app-capable`, ícones).
- `manifest.json` (name "Worship Stage FX", `display: standalone`,
  `background_color #0a0b10`) + **manifest inline dinâmico em Data URI** como
  reserva para quando o app roda sem servidor.
- **Service Worker** (`sw.js`) que guarda a página em cache — o app abre sem internet.
  Se o `sw.js` não estiver acessível, a página registra uma cópia inline equivalente.
- Botão **📲 INSTALAR APP** (evento `beforeinstallprompt`) + faixa flutuante de
  instalação. Botão **⬇️ SALVAR OFFLINE** força o cache dos arquivos essenciais.

### Instalar no Android (Motorola, Chrome)
1. Abra <https://yohann123c-hash.github.io/worship-stage-fx/> no Chrome.
2. Toque em **📲 INSTALAR APP** (ou menu ⋮ → *Instalar app* / *Adicionar à tela inicial*).
3. O app abre em tela cheia, sem barra do navegador, e funciona offline.

### iPhone (Safari)
Compartilhar → *Adicionar à Tela de Início*.

## 🚀 Publicação

O GitHub Pages serve a raiz da branch `main`. Para atualizar o app publicado:
basta enviar as alterações para `main` (o `index.html`, `manifest.json`, `sw.js`
e os ícones são servidos direto da raiz).

## 🛠️ Ferramentas de desenvolvimento

```bash
# Regenerar os ícones do PWA (192, 512, maskable 512 e apple-touch 180)
node tools/make-icons.mjs

# Testes automatizados (jsdom + Web Audio/IndexedDB falsos):
# verifica glide 1,5s, envelopes 1,8s/1,5s, os 16 pads, persistência dos
# samples e o cache offline do service worker.
npm i jsdom fake-indexeddb
node tools/smoke-test.mjs
```

O repositório não tem dependências de runtime: todo o app é um único `index.html`.
