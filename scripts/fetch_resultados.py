#!/usr/bin/env python3
"""Busca os placares da Copa 2026 na football-data.org e atualiza data/resultados.json.

Uso:
    FOOTBALL_DATA_TOKEN=xxxx python3 scripts/fetch_resultados.py

- Lê o token da env FOOTBALL_DATA_TOKEN (chave grátis em https://www.football-data.org/client/register).
- Só sobrescreve jogos que a API marca como FINISHED e que casam com um confronto da grade.
- Edições manuais em jogos NÃO retornados pela API são preservadas.
- Fase de grupos: o placar final = 90min + acréscimos (sem prorrogação). Seguro para o bolão.
- Mata-mata: a API pode devolver o placar já com prorrogação; por isso o mata-mata fica
  como fallback manual (ver README). Aqui só preenchemos a fase de grupos automaticamente.

Sem token (ou em caso de erro de rede) o script apenas atualiza o carimbo de data/hora
e termina sem alterar placares — o fallback manual continua valendo.
"""
import json
import os
import sys
import unicodedata
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTADOS = os.path.join(RAIZ, "data", "resultados.json")
JOGOS = os.path.join(RAIZ, "data", "jogos.json")
BRASILIA = timezone(timedelta(hours=-3))
API_URL = "https://api.football-data.org/v4/competitions/WC/matches"

# Nomes da API (inglês) -> nome em português usado na grade do bolão.
# Chave normalizada (sem acento, minúscula) para casar variações da API.
EN_PT = {
    "mexico": "México", "south africa": "África do Sul", "south korea": "Coreia do Sul",
    "korea republic": "Coreia do Sul", "czechia": "República Tcheca", "czech republic": "República Tcheca",
    "canada": "Canadá", "qatar": "Catar", "switzerland": "Suíça",
    "bosnia and herzegovina": "Bósnia e Herzegovina", "bosnia-herzegovina": "Bósnia e Herzegovina",
    "brazil": "Brasil", "morocco": "Marrocos", "haiti": "Haiti", "scotland": "Escócia",
    "united states": "Estados Unidos", "usa": "Estados Unidos", "paraguay": "Paraguai",
    "australia": "Austrália", "turkiye": "Turquia", "turkey": "Turquia",
    "germany": "Alemanha", "curacao": "Curaçao", "ivory coast": "Costa do Marfim",
    "cote d'ivoire": "Costa do Marfim", "cote divoire": "Costa do Marfim", "ecuador": "Equador",
    "netherlands": "Holanda", "japan": "Japão", "tunisia": "Tunísia", "sweden": "Suécia",
    "belgium": "Bélgica", "egypt": "Egito", "iran": "Irã", "new zealand": "Nova Zelândia",
    "spain": "Espanha", "cape verde": "Cabo Verde", "cabo verde": "Cabo Verde",
    "saudi arabia": "Arábia Saudita", "uruguay": "Uruguai",
    "france": "França", "senegal": "Senegal", "norway": "Noruega", "iraq": "Iraque",
    "argentina": "Argentina", "algeria": "Argélia", "austria": "Áustria", "jordan": "Jordânia",
    "portugal": "Portugal", "uzbekistan": "Uzbequistão", "colombia": "Colômbia",
    "dr congo": "RD Congo", "congo dr": "RD Congo", "democratic republic of congo": "RD Congo",
    "england": "Inglaterra", "croatia": "Croácia", "ghana": "Gana", "panama": "Panamá",
}


def norm(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    return s.replace("fc", "").replace("national team", "").strip()


def pt(nome_api):
    return EN_PT.get(norm(nome_api))


def agora_brasilia():
    return datetime.now(BRASILIA).strftime("%d/%m/%Y %H:%M")


def main():
    resultados = json.load(open(RESULTADOS, encoding="utf-8"))
    jogos = json.load(open(JOGOS, encoding="utf-8"))

    # índice: (casa_pt, fora_pt) normalizado -> chave do resultados.json
    indice = {}
    for g in jogos:
        chave = f"{g['data']} | {g['casa']} x {g['fora']}"
        indice[(norm(g["casa"]), norm(g["fora"]))] = chave

    token = os.environ.get("FOOTBALL_DATA_TOKEN", "").strip()
    atualizados = 0
    horarios = 0

    if not token:
        print("AVISO: FOOTBALL_DATA_TOKEN ausente — pulando a API (fallback manual segue válido).")
    else:
        try:
            req = urllib.request.Request(API_URL, headers={"X-Auth-Token": token})
            with urllib.request.urlopen(req, timeout=30) as resp:
                dados = json.loads(resp.read().decode())
            for m in dados.get("matches", []):
                casa = pt(m["homeTeam"].get("name") or m["homeTeam"].get("shortName"))
                fora = pt(m["awayTeam"].get("name") or m["awayTeam"].get("shortName"))
                if not casa or not fora:
                    continue
                chave = indice.get((norm(casa), norm(fora)))
                if not chave or chave not in resultados["grupos"]:
                    continue
                alvo = resultados["grupos"][chave]

                # (a) horário: para qualquer status, a partir do utcDate (UTC -> Brasília)
                utc = m.get("utcDate")
                if utc:
                    try:
                        dt = datetime.strptime(utc, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        hh = dt.astimezone(BRASILIA).strftime("%H:%M")
                        if alvo.get("horario") != hh:
                            alvo["horario"] = hh
                            horarios += 1
                    except ValueError:
                        pass

                # (b) placar: só fase de grupos FINISHED (placar = 90min, sem prorrogação)
                if m.get("status") != "FINISHED":
                    continue
                if m.get("stage") not in (None, "GROUP_STAGE", "GROUP STAGE"):
                    continue
                ft = m.get("score", {}).get("fullTime", {})
                gc, gf = ft.get("home"), ft.get("away")
                if gc is None or gf is None:
                    continue
                if alvo.get("gc") != gc or alvo.get("gf") != gf:
                    alvo["gc"], alvo["gf"] = gc, gf
                    atualizados += 1
                    print(f"  ✓ {chave} = {gc}x{gf}")
        except urllib.error.HTTPError as e:
            print(f"ERRO HTTP {e.code} na API: {e.read().decode()[:200]}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"ERRO ao consultar a API: {e}", file=sys.stderr)

    resultados["atualizado_em"] = agora_brasilia()
    json.dump(resultados, open(RESULTADOS, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"Concluído: {atualizados} placar(es) e {horarios} horário(s) · carimbo {resultados['atualizado_em']}")


if __name__ == "__main__":
    main()
