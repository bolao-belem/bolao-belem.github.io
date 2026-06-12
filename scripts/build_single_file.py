#!/usr/bin/env python3
"""Empacota o dashboard em arquivos HTML únicos (abrem no Chrome via file://, offline).

Gera DOIS arquivos na raiz do projeto:
  - bolao_grupo.html     -> versão para COMPARTILHAR (anônima: sem "Minha Cola",
                            sem destaque/identificação de nenhum participante).
  - bolao_pessoal.html   -> sua versão completa (com a aba Minha Cola e destaques).

Também gera o fragmento bolao_widget.html (sem <html>/<head>/<body>) usado como
artefato vivo para pinar no cowork.

Uso:  python3 scripts/build_single_file.py
"""
import json
import os
import re
from datetime import datetime, timezone, timedelta

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRASILIA = timezone(timedelta(hours=-3))

# index.html é ANÔNIMO por padrão. O modo 'pessoal' re-adiciona o que identifica o dono.
SUB_GRUPO = "Ranking ao vivo · 42 participantes · Copa do Mundo 2026"
SUB_PESSOAL = "Ranking ao vivo · 42 participantes · você é <strong>Marcelo Gaspar Garcia</strong>"
TAB_JOGOS = '<button class="aba" data-tab="jogos" role="tab">📅 Jogos</button>'
TAB_COLA = '\n    <button class="aba" data-tab="cola" role="tab">📝 Minha Cola</button>'


def ler(*partes):
    with open(os.path.join(RAIZ, *partes), encoding="utf-8") as f:
        return f.read()


def montar(modo, carimbo):
    """modo: 'pessoal' | 'grupo'."""
    css = ler("css", "styles.css")
    engine = ler("js", "engine.js")
    app = ler("js", "app.js")
    jogos = ler("data", "jogos.json")
    palpites = ler("data", "palpites.json")
    resultados = ler("data", "resultados.json")
    matamata = ler("data", "palpites_matamata.json")

    engine_inline = re.sub(r"^export\s+", "", engine, flags=re.MULTILINE)
    app_inline = re.sub(r"^import\s+\{[\s\S]*?\}\s+from\s+'\./engine\.js';\s*", "", app, count=1)

    pessoal = (modo == "pessoal")
    # anônimo é o default do app; só a versão pessoal precisa se identificar.
    flags = "window.__EU__ = 'Marcelo Gaspar Garcia';\n      " if pessoal else ""

    bundle = f"""<script type="application/json" id="dados-jogos">{jogos}</script>
  <script type="application/json" id="dados-palpites">{palpites}</script>
  <script type="application/json" id="dados-resultados">{resultados}</script>
  <script type="application/json" id="dados-matamata">{matamata}</script>
  <script>
      {flags}window.__BOLAO_DADOS__ = {{
      jogos: JSON.parse(document.getElementById('dados-jogos').textContent),
      palpites: JSON.parse(document.getElementById('dados-palpites').textContent),
      resultados: JSON.parse(document.getElementById('dados-resultados').textContent),
      matamata: JSON.parse(document.getElementById('dados-matamata').textContent),
    }};
  </script>
  <script>
{engine_inline}
{app_inline}
  </script>"""

    base = ler("index.html")
    html = base.replace('<link rel="stylesheet" href="css/styles.css" />', f"<style>\n{css}\n</style>")
    html = html.replace('<script type="module" src="js/app.js"></script>', bundle)

    nota = f"Versão offline · snapshot de {carimbo} · pontuação 5/2 (grupos) e 8/4 (mata-mata)."
    html = html.replace(
        "Resultados via <code>data/resultados.json</code> · pontuação 5/2 (grupos) e 8/4 (mata-mata).",
        nota,
    )

    if pessoal:
        html = html.replace(SUB_GRUPO, SUB_PESSOAL)
        html = html.replace(TAB_JOGOS, TAB_JOGOS + TAB_COLA)  # re-adiciona a aba Minha Cola

    return html


def main():
    carimbo = datetime.now(BRASILIA).strftime("%d/%m/%Y %H:%M")
    saidas = {
        "bolao_grupo.html": montar("grupo", carimbo),
        "bolao_pessoal.html": montar("pessoal", carimbo),
    }
    for nome, conteudo in saidas.items():
        cam = os.path.join(RAIZ, nome)
        with open(cam, "w", encoding="utf-8") as f:
            f.write(conteudo)
        print(f"OK  {nome}  ({os.path.getsize(cam) / 1024:.0f} KB)")
    print(f"\nsnapshot {carimbo}")
    print("  • bolao_grupo.html   → compartilhar no grupo (anônimo)")
    print("  • bolao_pessoal.html → sua cópia completa")


if __name__ == "__main__":
    main()
