#!/usr/bin/env python3
"""Prepara os dados do app no formato LEVE (normalizado).

Fonte de verdade (não é alterada): data/bolao_palpites_todos.json
Gera:
  - data/jogos.json     -> a lista dos 72 jogos UMA vez só [{data,grupo,casa,fora}]
  - data/palpites.json  -> por participante só {nome,campeao,artilheiro,p:[[gc,gf]×72]}
  - data/resultados.json -> garante o campo 'horario' por jogo (preserva placares já preenchidos)

Por que: no formato antigo cada participante repetia a lista inteira de jogos (42×),
inflando ~422 KB. Normalizando, cai para ~30 KB e o app carrega muito mais rápido.

Rode sempre que mudar a fonte de palpites:
    python3 scripts/preparar_dados.py
"""
import json
import os
from collections import OrderedDict

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(RAIZ, "data")


def main():
    fonte = json.load(open(os.path.join(D, "bolao_palpites_todos.json"), encoding="utf-8"))
    ref = fonte[0]["palpites"]  # mesma grade para todos

    # 1) lista de jogos (ordem da fonte = índice alinhado com p[] dos participantes)
    jogos = [{"data": g["data"], "grupo": g["grupo"], "casa": g["casa"], "fora": g["fora"]} for g in ref]
    json.dump(jogos, open(os.path.join(D, "jogos.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(f"jogos.json: {len(jogos)} jogos")

    # 2) palpites compactos
    compactos = []
    for p in fonte:
        compactos.append({
            "nome": p["nome"],
            "campeao": p["campeao"],
            "artilheiro": p["artilheiro"],
            "p": [list(x["palpite"]) for x in p["palpites"]],
        })
    json.dump(compactos, open(os.path.join(D, "palpites.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(f"palpites.json: {len(compactos)} participantes × {len(compactos[0]['p'])} palpites")

    # 3) resultados.json — garante 'horario' e preserva o que já estiver preenchido
    cam = os.path.join(D, "resultados.json")
    atual = json.load(open(cam, encoding="utf-8")) if os.path.exists(cam) else {}
    velhos = atual.get("grupos", {})

    def dkey(item):
        k, v = item
        dd, mm = k.split(" | ")[0].split("/")
        return (int(mm), int(dd), v["grupo"])

    novos = OrderedDict()
    for g in jogos:
        chave = f"{g['data']} | {g['casa']} x {g['fora']}"
        ant = velhos.get(chave, {})
        novos[chave] = {
            "grupo": g["grupo"],
            "horario": ant.get("horario"),
            "gc": ant.get("gc"),
            "gf": ant.get("gf"),
        }
    novos = OrderedDict(sorted(novos.items(), key=dkey))

    resultados = OrderedDict()
    resultados["_instrucoes"] = (
        "FALLBACK MANUAL: 'horario' = HH:MM (Brasilia) ou null; 'gc'/'gf' = gols casa/fora "
        "(null = nao jogado). Mata-mata: so 90min+acrescimos (sem prorrogacao/penaltis)."
    )
    resultados["config"] = atual.get("config", {"pagantes": 42})
    resultados["atualizado_em"] = atual.get("atualizado_em")
    resultados["master"] = atual.get("master", {"campeao": None, "artilheiro": None})
    resultados["grupos"] = novos
    json.dump(resultados, open(cam, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"resultados.json: {len(novos)} jogos (campo 'horario' garantido)")

    # tamanhos
    def kb(nome):
        return os.path.getsize(os.path.join(D, nome)) / 1024
    print(f"\nTamanho:  jogos.json {kb('jogos.json'):.0f}KB + palpites.json {kb('palpites.json'):.0f}KB "
          f"= {kb('jogos.json')+kb('palpites.json'):.0f}KB  (antes: {kb('bolao_palpites_todos.json'):.0f}KB)")


if __name__ == "__main__":
    main()
