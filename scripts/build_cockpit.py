#!/usr/bin/env python3
"""Gera o 'cockpit' pessoal — um cartão compacto (HTML, sem <html>/<head>/<body>) com a
sua posição, pontos e os jogos de HOJE com o seu palpite. Ideal para pinar no cowork.

Uso:  python3 scripts/build_cockpit.py
Gera: bolao_cockpit.html  (fragmento; cole no artefato/cowork ou abra no navegador)

É um SNAPSHOT: os números são calculados na hora da geração. Rode de novo para atualizar.
A versão que se atualiza sozinha é o link do GitHub Pages.
"""
import json
import os
import html
from datetime import datetime, timezone, timedelta

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(RAIZ, "data")
BR = timezone(timedelta(hours=-3))
EU = "Marcelo Gaspar Garcia"
MES = {"06": "jun", "07": "jul"}


def main():
    jogos = json.load(open(os.path.join(D, "jogos.json"), encoding="utf-8"))
    comp = json.load(open(os.path.join(D, "palpites.json"), encoding="utf-8"))
    grupos = json.load(open(os.path.join(D, "resultados.json"), encoding="utf-8"))["grupos"]

    parts = [{"nome": c["nome"], "campeao": c["campeao"], "artilheiro": c["artilheiro"],
              "palpites": [{**jogos[i], "palpite": c["p"][i]} for i in range(len(jogos))]} for c in comp]

    def chave(g):
        return f"{g['data']} | {g['casa']} x {g['fora']}"

    def real(g):
        r = grupos.get(chave(g))
        return (r["gc"], r["gf"]) if r and r["gc"] is not None and r["gf"] is not None else None

    def hora(g):
        r = grupos.get(chave(g))
        return r.get("horario") if r else None

    def pts(pal, rl):
        if rl is None:
            return (0, "pendente")
        if pal[0] == rl[0] and pal[1] == rl[1]:
            return (5, "exato")
        s = lambda a, b: (a > b) - (a < b)
        return (2, "parcial") if s(pal[0], pal[1]) == s(rl[0], rl[1]) else (0, "errou")

    linhas = []
    for p in parts:
        P = E = Z = 0
        for g in p["palpites"]:
            pt, st = pts(g["palpite"], real(g))
            P += pt; E += st == "exato"; Z += st == "errou"
        linhas.append({"nome": p["nome"], "P": P, "E": E, "Z": Z})
    linhas.sort(key=lambda l: (-l["P"], -l["E"], l["Z"], l["nome"]))
    pos = 1; ant = None
    for i, l in enumerate(linhas):
        sig = (l["P"], l["E"], l["Z"])
        if sig != ant:
            pos = i + 1; ant = sig
        l["pos"] = pos
    me = next(l for l in linhas if l["nome"] == EU)
    mep = next(p for p in parts if p["nome"] == EU)

    hoje = datetime.now(BR).strftime("%d/%m")
    datas = [g["data"] for g in jogos]
    if hoje not in datas:
        fut = sorted({d for d in datas if (int(d[3:5]), int(d[0:2])) >= (int(hoje[3:5]), int(hoje[0:2]))},
                     key=lambda d: (int(d[3:5]), int(d[0:2])))
        hoje = fut[0] if fut else datas[0]
    longa = lambda d: f"{d[0:2]} {MES.get(d[3:5], d[3:5])}"
    doDia = [g for g in jogos if g["data"] == hoje]

    def consenso(g):
        casa = emp = fora = 0; pl = {}; meu = None
        for p in parts:
            x = next(z for z in p["palpites"] if z["casa"] == g["casa"] and z["fora"] == g["fora"] and z["data"] == g["data"])
            a, b = x["palpite"]
            if a > b: casa += 1
            elif a < b: fora += 1
            else: emp += 1
            pl[f"{a}x{b}"] = pl.get(f"{a}x{b}", 0) + 1
            if p["nome"] == EU: meu = x["palpite"]
        mv = max(pl.items(), key=lambda kv: kv[1])
        return casa, emp, fora, len(parts), mv[0], mv[1], meu

    e = html.escape
    carimbo = datetime.now(BR).strftime("%d/%m/%Y %H:%M")
    cards = ""
    for g in sorted(doDia, key=lambda g: (hora(g) or "99:99", g["grupo"])):
        casa, emp, fora, tot, mv, mvq, meu = consenso(g)
        pc = lambda n: round(n / tot * 100)
        rl = real(g); h = hora(g)
        direita = f"{rl[0]}x{rl[1]}" if rl else (f"🕒 {h}" if h else "a jogar")
        pal, st = pts(meu, rl)
        chip = {"pendente": "—", "exato": f"+{pal} exato", "parcial": f"+{pal}", "errou": "0"}[st]
        cards += f"""
    <div class="ck-jogo">
      <div class="ck-jogo-top"><span><b>{e(g['grupo'])}</b> {e(g['casa'])} <small>x</small> {e(g['fora'])}</span><span class="ck-dir">{e(direita)}</span></div>
      <div class="ck-bar"><i style="width:{pc(casa)}%"></i><u style="width:{pc(emp)}%"></u><s style="width:{pc(fora)}%"></s></div>
      <div class="ck-leg">{e(g['casa'])} {pc(casa)}% · empate {pc(emp)}% · {e(g['fora'])} {pc(fora)}% <span class="ck-mv">mais votado {mv} ({mvq})</span></div>
      <div class="ck-meu">📝 Meu palpite <b>{meu[0]}x{meu[1]}</b> <span class="ck-chip s-{st}">{chip}</span></div>
    </div>"""

    cockpit = f"""<style>
.ckp{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:440px;margin:0 auto;color:#14171f;background:#f5f6f8;border-radius:16px;overflow:hidden;border:1px solid #e6e8ec}}
.ckp *{{box-sizing:border-box}}
.sr-only{{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}}
.ck-top{{background:#009739;color:#fff;padding:14px 16px}}
.ck-top h3{{margin:0;font-size:1.05rem}}
.ck-top p{{margin:3px 0 0;font-size:.74rem;opacity:.92}}
.ck-stats{{display:flex;gap:8px;padding:12px}}
.ck-stat{{flex:1;background:#fff;border-radius:11px;padding:9px 4px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,.06)}}
.ck-stat b{{display:block;font-size:1.35rem;line-height:1}}
.ck-stat span{{font-size:.64rem;color:#6b7280}}
.ck-sec{{font-size:.72rem;font-weight:800;color:#0a2a66;text-transform:uppercase;letter-spacing:.04em;margin:6px 16px 6px}}
.ck-jogo{{background:#fff;margin:0 12px 9px;border-radius:11px;padding:10px 12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}}
.ck-jogo-top{{display:flex;justify-content:space-between;gap:8px;font-size:.86rem;font-weight:600}}
.ck-jogo-top small{{color:#9aa0a9}}
.ck-dir{{font-weight:800;white-space:nowrap}}
.ck-bar{{display:flex;height:8px;border-radius:99px;overflow:hidden;margin:8px 0 4px;background:#e6e8ec}}
.ck-bar i{{background:#009739}}.ck-bar u{{background:#9aa0a9}}.ck-bar s{{background:#2563c9}}
.ck-leg{{font-size:.66rem;color:#6b7280}}
.ck-mv{{display:block;margin-top:1px}}
.ck-meu{{margin-top:7px;font-size:.82rem;background:#fff7d6;border:1px solid #f0c400;border-radius:8px;padding:6px 9px;display:flex;justify-content:space-between;align-items:center}}
.ck-chip{{font-size:.7rem;font-weight:700;padding:2px 7px;border-radius:99px;background:#eef0f3;color:#9aa0a9}}
.s-exato{{background:#e3f5e9;color:#009739}}.s-parcial{{background:#fff3da;color:#c98a00}}.s-errou{{background:#fdeaea;color:#c0392b}}
.ck-master{{margin:0 12px 12px;background:#fff7d6;border:1px solid #f0c400;border-radius:11px;padding:10px 12px;font-size:.86rem}}
.ck-foot{{font-size:.66rem;color:#6b7280;text-align:center;padding:0 16px 12px}}
</style>
<h2 class="sr-only">Cockpit pessoal do Bolão da Copa 2026 de Marcelo.</h2>
<div class="ckp">
  <div class="ck-top"><h3>🔥 Minha Cola — Marcelo</h3><p>Bolão Copa 2026 · {e(longa(hoje))} · snapshot {e(carimbo)}</p></div>
  <div class="ck-stats">
    <div class="ck-stat"><b>{me['pos']}º</b><span>POSIÇÃO</span></div>
    <div class="ck-stat"><b>{me['P']}</b><span>PONTOS</span></div>
    <div class="ck-stat"><b>{me['E']}</b><span>EXATOS</span></div>
    <div class="ck-stat"><b>{me['Z']}</b><span>ZEROS</span></div>
  </div>
  <div class="ck-sec">⚽ Jogos de hoje · {e(longa(hoje))}</div>
  {cards if cards.strip() else '<div class="ck-jogo">Sem jogos hoje.</div>'}
  <div class="ck-master">⭐ <b>Meus master</b> — 🏆 Campeão: <b>{e(mep['campeao'])}</b> · 🥇 Artilheiro: <b>{e(mep['artilheiro'])}</b></div>
  <div class="ck-foot">Snapshot pessoal · a versão que se atualiza sozinha é o link do GitHub Pages.</div>
</div>"""
    cam = os.path.join(RAIZ, "bolao_cockpit.html")
    open(cam, "w", encoding="utf-8").write(cockpit)
    print(f"OK  bolao_cockpit.html ({os.path.getsize(cam)/1024:.1f} KB) · {len(doDia)} jogos em {hoje} · pos {me['pos']}º {me['P']}pts")


if __name__ == "__main__":
    main()
