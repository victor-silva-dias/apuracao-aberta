// Motor de acompanhamento contínuo: consulta o TSE em intervalo, redesenha o painel,
// detecta eventos e alimenta o acervo (snapshots + eventos.jsonl) que o MCP lê.
//
// Uso: bun src/motor.ts --uf br,sp [--cargos presidente,governador,senador] [--intervalo 30]
//      bun src/motor.ts --descobrir --uf br,sp     (testa padrões de URL e sai)

import { parseArgs } from "node:util";
import { DADOS, registrarEvento, salvarSnapshot } from "./acervo.ts";
import {
  BASE, CARGOS, buscar, caminhos, descobrirPleito, eleicaoDoCargo, get,
  type Pleito, type Resultado,
} from "./tse.ts";

const { values: opt } = parseArgs({
  options: {
    uf: { type: "string", default: "br" },
    cargos: { type: "string" },
    intervalo: { type: "string", default: "30" },
    top: { type: "string", default: "6" },
    turno: { type: "string", default: "1" },
    ciclo: { type: "string", default: "ele2026" },
    "uma-vez": { type: "boolean", default: false },
    descobrir: { type: "boolean", default: false },
  },
});

const INTERVALO = Math.max(10, Number(opt.intervalo)) * 1000; // piso de 10s: o CDN é público, sejamos educados
const TOP = Number(opt.top);

type Alvo = {
  uf: string; cargo: number; nomeCargo: string;
  assinatura?: string; lider?: string; marcos: Set<number>;
  ultimo?: Resultado; status?: string;
};

function montarAlvos(pleito: Pleito): Alvo[] {
  const alvos: Alvo[] = [];
  for (const uf of opt.uf!.toLowerCase().split(",").map((s) => s.trim()).filter(Boolean)) {
    const padrao = uf === "br" ? ["presidente"] : ["presidente", "governador", "senador"];
    const chaves = opt.cargos ? opt.cargos.toLowerCase().split(",") : padrao;
    for (let k of chaves) {
      k = k.trim();
      if (uf === "df" && k === "depest") k = "depdist";
      const cargo = CARGOS[k as keyof typeof CARGOS];
      if (!cargo) { console.error(`cargo desconhecido: ${k} (use ${Object.keys(CARGOS).join(", ")})`); process.exit(1); }
      if (uf === "br" && cargo.cd !== 1) continue; // só presidente tem abrangência nacional
      if (!eleicaoDoCargo(pleito, cargo.cd)) { console.error(`sem eleição para ${cargo.nome} no turno ${opt.turno}`); continue; }
      alvos.push({ uf, cargo: cargo.cd, nomeCargo: cargo.nome, marcos: new Set() });
    }
  }
  return alvos;
}

// ---- eventos ----

const eventos: string[] = [];
const vistos = new Set<string>();

async function evento(alvo: Alvo, msg: string) {
  const hora = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
  eventos.push(`${hora}  ${alvo.uf.toUpperCase()} · ${alvo.nomeCargo}: ${msg}`);
  if (eventos.length > 10) eventos.shift();
  process.stdout.write("\x07");
  await registrarEvento({ quando: new Date().toISOString(), uf: alvo.uf, cargo: alvo.nomeCargo, msg });
}

async function processar(alvo: Alvo, r: Resultado) {
  const assinatura = `${r.atualizado}|${r.secoesTotalizadas}|${r.candidatos.map((c) => c.votos).join(",")}`;
  if (assinatura === alvo.assinatura) return;
  const primeira = alvo.assinatura == null;
  const comecou = (alvo.ultimo?.secoesTotalizadas ?? 0) === 0 && r.secoesTotalizadas > 0;
  alvo.assinatura = assinatura;
  alvo.ultimo = r;
  await salvarSnapshot(r);

  if (primeira) await evento(alvo, `conectado (${fmtPct(r.pctSecoes)} das seções)`);
  if (comecou && !primeira) await evento(alvo, `apuração começou (${fmtPct(r.pctSecoes)} das seções)`);

  const lider = r.candidatos[0];
  if (lider && r.secoesTotalizadas > 0) {
    if (alvo.lider && alvo.lider !== lider.nome) await evento(alvo, `${lider.nome} passa a liderar`);
    alvo.lider = lider.nome;
  }
  for (const m of [10, 25, 50, 75, 90, 99, 100]) {
    if (r.pctSecoes >= m && !alvo.marcos.has(m)) {
      alvo.marcos.add(m);
      if (!primeira) await evento(alvo, `${m}% das seções totalizadas; lidera ${lider?.nome ?? "?"} (${fmtPct(lider?.pct ?? 0)})`);
    }
  }
  // Situação só vem do TSE (campo st). O motor nunca infere eleito/2º turno.
  for (const c of r.candidatos) {
    const chave = `${r.uf}|${r.cargo}|${c.nome}|${c.situacao}`;
    if (c.situacao && /eleito|2º turno/i.test(c.situacao) && !vistos.has(chave)) {
      vistos.add(chave);
      await evento(alvo, `${c.nome}: ${c.situacao} (segundo o TSE)`);
    }
  }
  if (r.totalizacaoFinal && !alvo.marcos.has(-1)) {
    alvo.marcos.add(-1);
    await evento(alvo, "totalização final");
  }
}

// ---- render ----

const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const fmtPct = (n: number) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const barra = (pct: number, w = 24) => "█".repeat(Math.round((pct / 100) * w)).padEnd(w, "·");
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const D = (s: string) => `\x1b[2m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;

function painel(alvo: Alvo): string {
  const r = alvo.ultimo;
  const titulo = B(`${alvo.uf.toUpperCase()} · ${alvo.nomeCargo}`);
  if (!r) return `${titulo}  ${D(`aguardando divulgação (${alvo.status ?? "…"})`)}\n`;
  const linhas = [
    `${titulo}  ${fmtPct(r.pctSecoes)} das seções (${fmtInt(r.secoesTotalizadas)}/${fmtInt(r.secoes)})  ${D(`TSE ${r.atualizado}`)}${r.totalizacaoFinal ? G("  FINAL") : ""}`,
  ];
  for (const [i, c] of r.candidatos.slice(0, TOP).entries()) {
    const tag = c.situacao && c.situacao !== "-" ? ` ${c.eleito ? G(c.situacao) : D(c.situacao)}` : "";
    linhas.push(
      `  ${(r.secoesTotalizadas > 0 ? String(i + 1) : "–").padStart(2)}. ${c.numero.padEnd(5)} ${c.nome.slice(0, 28).padEnd(28)} ${c.partido.padEnd(14).slice(0, 14)} ` +
      `${fmtInt(c.votos).padStart(12)}  ${fmtPct(c.pct).padStart(7)}  ${barra(c.pct)}${tag}`,
    );
  }
  if (r.candidatos.length > TOP) linhas.push(D(`      … +${r.candidatos.length - TOP} candidatos`));
  linhas.push(D(`  abstenção ${fmtPct(r.pctAbstencao)} · brancos ${fmtPct(r.pctBrancos)} · nulos ${fmtPct(r.pctNulos)} · comparecimento ${fmtInt(r.comparecimento)}`));
  return linhas.join("\n") + "\n";
}

function render(alvos: Alvo[], pleito: Pleito, proxima: Date) {
  const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const out = [
    B(`Apuração Aberta · Eleições ${pleito.data}, ${opt.turno}º turno`) + D(`   ${hora(new Date())} · próxima consulta ${hora(proxima)} · fonte ${BASE}`),
    "",
    ...alvos.map(painel),
    B("Eventos"),
    ...(eventos.length ? eventos.map((e) => `  ${e}`) : [D("  nenhum ainda")]),
    "",
    D(`acervo em ${DADOS} · Ctrl+C para sair`),
  ];
  console.clear();
  console.log(out.join("\n"));
}

// ---- modos ----

async function descobrir(pleito: Pleito, alvos: Alvo[]) {
  for (const a of alvos) {
    const ele = eleicaoDoCargo(pleito, a.cargo)!;
    console.log(B(`${a.uf.toUpperCase()} · ${a.nomeCargo} (eleição ${ele.cd})`));
    for (const p of caminhos(pleito.ciclo, ele.cd, a.uf, a.cargo)) {
      const r = await get(p).catch((e) => ({ status: `erro ${e.message}` }));
      console.log(`  ${String(r.status).padEnd(4)} ${BASE}/${p}`);
    }
  }
}

async function main() {
  const pleito = await descobrirPleito(opt.ciclo, opt.turno);
  const alvos = montarAlvos(pleito);
  if (!alvos.length) { console.error("nenhum alvo válido"); process.exit(1); }
  if (opt.descobrir) return descobrir(pleito, alvos);

  while (true) {
    for (const a of alvos) {
      const { resultado, status } = await buscar(pleito, a.uf, a.cargo);
      a.status = status;
      if (resultado) await processar(a, resultado);
    }
    const proxima = new Date(Date.now() + INTERVALO);
    render(alvos, pleito, proxima);
    if (opt["uma-vez"]) break;
    await Bun.sleep(INTERVALO + Math.random() * 2000);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
