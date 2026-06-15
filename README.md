# ⚽ Bolão Copa do Mundo 2026 — Dashboard

Dashboard web (estático, mobile-first) que compara os **resultados reais** dos jogos da Copa 2026 com os **palpites dos 42 participantes** e calcula o **ranking ao vivo**. Participante de referência: **Marcelo Gaspar Garcia**.

## Telas
- **🔥 Hoje** — panorama dos jogos do dia: placar/status, o palpite mais votado do grupo, a divisão casa/empate/fora dos 42, o seu palpite em destaque e, quando o jogo acaba, quantos cravaram. É a tela de abertura.
- **🏆 Ranking** — posição, pontos, exatos, zeros e projeção de prêmio (top 3). Sua linha em destaque.
- **📅 Jogos** — por data: placar real (ou "a jogar") e o palpite de cada um, com os pontos. Filtros por grupo e por participante.
- **📝 Minha Cola** — só os seus palpites, com os jogos de **hoje** no topo. Conferência pré-jogo no celular.
- **⭐ Master** — campeão e artilheiro de todos, com contagem (grafias de artilheiro normalizadas).

## Como funciona a pontuação
| Resultado do palpite | Fase de grupos | Mata-mata |
|---|---|---|
| Placar exato | **5** | **8** |
| Acertou vencedor/empate, errou placar | **2** | **4** |
| Errou | 0 | 0 |

- Mata-mata vale **só os 90min + acréscimos** (prorrogação e pênaltis não contam; empate nos 90' conta como empate).
- **Master** (liquidam no fim da Copa): Campeão = 5 pts, Artilheiro = 5 pts. Em empate na artilharia, vale qualquer um dos líderes.
- **Desempate:** 1) mais exatos · 2) menos zeros · 3) acertou campeão · 4) acertou artilheiro · 5) divide.
- **Prêmio:** pote = nº pagantes × R$150 − R$300 → 60% / 30% / 10% (nº de pagantes ajustável na tela Ranking).

O motor está em [`js/engine.js`](js/engine.js), coberto por testes em [`test/`](test/).

---

## 📲 Arquivos para compartilhar (1 arquivo cada, abrem no Chrome offline)

```bash
python3 scripts/build_single_file.py   # gera bolao_grupo.html + bolao_pessoal.html
python3 scripts/build_cockpit.py       # gera bolao_cockpit.html (cartão pessoal)
```

| Arquivo | Para quê | Conteúdo |
|---|---|---|
| **`bolao_grupo.html`** (~81 KB) | mandar no grupo | **anônimo**: sem "Minha Cola", sem identificar/destacar ninguém. Marcelo aparece como 1 dos 42 no ranking, como todo mundo. |
| **`bolao_pessoal.html`** (~81 KB) | sua cópia | dashboard completo, com a aba Minha Cola e seus destaques. |
| **`bolao_cockpit.html`** (~4 KB) | pinar no cowork | cartão compacto: sua posição, pontos e os jogos de hoje com o seu palpite. |

> Todos são **snapshots**: congelam o estado do momento. Para atualizar, edite `data/resultados.json`, rode os comandos de novo e reenvie. (Para algo que se atualiza sozinho, use a URL do GitHub Pages.)

---

## 🌐 Publicar online (GitHub Pages) — passo a passo

> Pré-requisito: ter uma conta no GitHub. Os comandos abaixo rodam no terminal, dentro desta pasta.

1. **Crie o repositório** em https://github.com/new — nome sugerido `bolao-copa-2026`, **público**. Não marque "add README".

2. **Suba o código** (troque `SEU-USUARIO`):
   ```bash
   cd "/Users/marcelogarcia/Downloads/Bolao_Copa_2026_Dashboard"
   git init -b main
   git add .
   git commit -m "feat: dashboard do bolão da Copa 2026"
   git remote add origin https://github.com/SEU-USUARIO/bolao-copa-2026.git
   git push -u origin main
   ```

3. **Ative o GitHub Pages**: repositório → **Settings → Pages** → em *Build and deployment*, **Source = GitHub Actions**.

4. **(Opcional, recomendado) Cadastre a chave da API** para atualização automática:
   - Crie a chave grátis em https://www.football-data.org/client/register (plano *Free*).
   - No repositório: **Settings → Secrets and variables → Actions → New repository secret**.
   - Nome: `FOOTBALL_DATA_TOKEN` · Valor: a chave recebida por e-mail.

5. Pronto. A URL pública será:
   ```
   https://SEU-USUARIO.github.io/bolao-copa-2026/
   ```
   (Aparece também em Settings → Pages após a 1ª publicação.)

### Atualização automática (ao vivo, no navegador)
A fonte principal de frescor é **client-side**: o próprio site busca os placares direto da **API pública da ESPN** (`.../soccer/fifa.world/scoreboard`, a Copa inteira numa chamada) a cada **60s** e ao focar a aba — CORS liberado, **grátis, sem chave, sem servidor** e **sem depender do GitHub**. Assim, quando um jogo termina, qualquer página aberta reflete em ~1 min (cabeçalho mostra `🟢 ao vivo`). Ver `iniciarAoVivo()`/`aplicarResultadosAoVivo()` em [`js/app.js`](js/app.js).

> Só aplica placar **final (status `post`)** e apenas jogos da fase de grupos (o índice só tem os 72 confrontos de grupo) — mata-mata fica no preenchimento manual (90', sem prorrogação).

**Reserva (server-side):** a Action [`.github/workflows/atualizar-resultados.yml`](.github/workflows/atualizar-resultados.yml) continua buscando na football-data.org e gravando `data/resultados.json` — usado no 1º render e como fallback. (A TheSportsDB foi testada e descartada: cobertura grátis incompleta para a Copa 2026.)

### 🔄 Disparar atualização manual (sob demanda)
No GitHub: aba **Actions** → workflow **"Atualizar resultados e publicar"** → botão **"Run workflow"** → **Run**. Em ~1 minuto o site reflete os novos placares.

---

## ✍️ Editar o resultado de um jogo na mão (fallback manual)

Funciona com ou sem API — basta editar [`data/resultados.json`](data/resultados.json). Cada jogo é uma linha em `"grupos"`:

```json
"11/06 | México x África do Sul": { "grupo": "A", "horario": null, "gc": null, "gf": null }
```

Troque os valores de `null` para o número/texto:

```json
"11/06 | México x África do Sul": { "grupo": "A", "horario": "13:00", "gc": 2, "gf": 0 }
```

- `horario` = horário de início (HH:MM, Brasília). Aparece como 🕒 enquanto o jogo não começou. A API preenche sozinha; você também pode digitar.
- `gc` (gols casa) e `gf` (gols fora). Deixe `null` enquanto o jogo não foi jogado (aparece como "a jogar" / horário).
- Para registrar o campeão/artilheiro no fim da Copa, preencha o bloco `"master"`:
  ```json
  "master": { "campeao": "Brasil", "artilheiro": "Kylian Mbappé" }
  ```
  Em empate de artilharia, use uma lista: `"artilheiro": ["Kylian Mbappé", "Harry Kane"]`.
- Ajuste `"config": { "pagantes": 42 }` se o número de pagantes mudar.

**Para publicar a edição manual:**
```bash
git add data/resultados.json && git commit -m "resultado: México 2x0 África do Sul" && git push
```
O `push` na branch `main` republica o site automaticamente (sem re-consultar a API).

> **Mata-mata:** os placares só valem 90min. A API pode devolver o placar já com prorrogação, então o mata-mata é preenchido **à mão** em `data/palpites_matamata.json` (os palpites de cada fase chegam fase a fase). O motor já pontua 8/4.

---

## 🧪 Rodar local

```bash
# servidor estático simples
python3 -m http.server 4326
# abra http://localhost:4326

# testes do motor de pontuação (precisa do Node)
npm test          # ou: node --test
```

## Estrutura
```
index.html               # casca + abas
css/styles.css           # estilo mobile-first
js/engine.js             # motor de pontuação (puro, testável)
js/app.js                # UI das 5 telas
data/jogos.json          # os 72 jogos, 1× só (lista que o app carrega)   ← leve
data/palpites.json       # por participante só os placares [[gc,gf]×72]   ← leve
data/resultados.json     # horários + placares (API + fallback manual)
data/palpites_matamata.json      # estrutura pronta do mata-mata (8/4)
data/bolao_palpites_todos.json   # FONTE original (42×72) — não é carregada pelo site
scripts/preparar_dados.py        # gera jogos.json + palpites.json a partir da fonte
scripts/fetch_resultados.py      # busca horários + placares na football-data.org
scripts/build_single_file.py     # gera bolao_grupo.html + bolao_pessoal.html
scripts/build_cockpit.py         # gera bolao_cockpit.html (cartão pessoal p/ cowork)
test/                            # testes do motor e validação dos dados
.github/workflows/               # Action que verifica durante os jogos e publica ao sair resultado
```

## ⚡ Arquitetura e leveza
A fonte (`bolao_palpites_todos.json`, ~410 KB) repetia a lista dos 72 jogos para cada um dos 42 participantes. O site **não carrega** esse arquivo: ele usa `jogos.json` (a lista dos jogos, uma vez) + `palpites.json` (só os placares de cada um) e junta os dois na hora — **~410 KB → ~32 KB**. Além disso, jogos/palpites ficam em **cache** do navegador (não mudam); só `resultados.json` é rebaixado a cada visita. Resultado: abre rápido mesmo no celular.

> Mudou a fonte de palpites? Rode `python3 scripts/preparar_dados.py` para regenerar os arquivos leves.

## Por que football-data.org?
Plano **Free** cobre a Copa do Mundo (competição `WC`), retorna JSON limpo e exige só uma chave grátis (sem cartão). Alternativas avaliadas: *API-Football* (via RapidAPI, free 100 req/dia, mais burocrática) e *TheSportsDB* (grátis, porém cobertura/precisão menos garantida para a Copa). A integração é **best-effort**: se a chave faltar ou a API falhar, o site continua 100% funcional pelo fallback manual.
