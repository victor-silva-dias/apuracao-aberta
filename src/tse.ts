// Cliente do CDN de divulgação de resultados do TSE (resultados.tse.jus.br).
// Não é API documentada: são JSONs estáticos que o app Resultados consome.
// Base pode ser URL http(s) ou diretório local (fixtures pra testar fora do horário).

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const BASE = process.env.TSE_BASE ?? "https://resultados.tse.jus.br";
const AMBIENTE = process.env.TSE_AMBIENTE ?? "oficial";

export const CARGOS = {
  presidente: { cd: 1, nome: "Presidente" },
  governador: { cd: 3, nome: "Governador" },
  senador: { cd: 5, nome: "Senador" },
  depfed: { cd: 6, nome: "Deputado Federal" },
  depest: { cd: 7, nome: "Deputado Estadual" },
  depdist: { cd: 8, nome: "Deputado Distrital" },
} as const;
export type ChaveCargo = keyof typeof CARGOS;

export type Resposta = { status: number; json?: any; etag?: string; url: string };

const etags = new Map<string, { etag: string; json: any }>();

export async function get(path: string): Promise<Resposta> {
  if (!/^https?:/.test(BASE)) {
    const file = join(BASE, path);
    try {
      return { status: 200, json: JSON.parse(await readFile(file, "utf8")), url: file };
    } catch {
      return { status: 404, url: file };
    }
  }
  const url = `${BASE}/${path}`;
  const cache = etags.get(url);
  const headers: Record<string, string> = { "user-agent": "apuracao-aberta/0.1 (+https://github.com/victor-silva-dias/apuracao-aberta)" };
  if (cache) headers["if-none-match"] = cache.etag;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (res.status === 304 && cache) return { status: 200, json: cache.json, etag: cache.etag, url };
  if (!res.ok) return { status: res.status, url };
  const json = await res.json();
  const etag = res.headers.get("etag");
  if (etag) etags.set(url, { etag, json });
  return { status: 200, json, etag: etag ?? undefined, url };
}

export type Eleicao = { cd: string; nome: string; turno: string; cargos: number[] };
export type Pleito = { ciclo: string; data: string; eleicoes: Eleicao[] };

/** Lê ele-c.json e devolve o pleito do ciclo (default ele2026) para o turno pedido. */
export async function descobrirPleito(ciclo = "ele2026", turno = "1"): Promise<Pleito> {
  const r = await get(`${AMBIENTE}/comum/config/ele-c.json`);
  if (r.status !== 200) throw new Error(`config ele-c.json indisponível (HTTP ${r.status})`);
  const pleitos = (r.json.pl as any[]).filter((p) => p.c === ciclo);
  const eleicoes: Eleicao[] = [];
  let data = "";
  for (const p of pleitos) {
    for (const e of p.e as any[]) {
      if (e.t !== turno || e.tp === "7") continue; // tp 7 = consulta popular
      const cargos = new Set<number>();
      for (const a of e.abr ?? []) for (const c of a.cp ?? []) cargos.add(Number(c.cd));
      eleicoes.push({ cd: e.cd, nome: e.nm, turno: e.t, cargos: [...cargos] });
      data ||= p.dt;
    }
  }
  if (!eleicoes.length) throw new Error(`nenhuma eleição ${ciclo} turno ${turno} na config`);
  return { ciclo, data, eleicoes };
}

export function eleicaoDoCargo(pleito: Pleito, cargo: number): Eleicao | undefined {
  return pleito.eleicoes.find((e) => e.cargos.includes(cargo));
}

const pad = (n: number | string, w: number) => String(n).padStart(w, "0");

/**
 * Padrões de arquivo, em ordem de preferência. `dados/...-u.json` é o confirmado em 2026
 * (aninhado: carg → agr → par → cand; totais em s/e/v). `-r.json` é o simplificado de 2022.
 */
export function caminhos(ciclo: string, ele: string, uf: string, cargo: number): string[] {
  const c = pad(cargo, 4), e = pad(ele, 6);
  return [
    `${AMBIENTE}/${ciclo}/${ele}/dados/${uf}/${uf}-c${c}-e${e}-u.json`,
    `${AMBIENTE}/${ciclo}/${ele}/dados-simplificados/${uf}/${uf}-c${c}-e${e}-r.json`,
  ];
}

// ---- normalização ----

export const num = (v: any): number =>
  v == null || v === "" ? 0 : Number(String(v).replace(/\./g, "").replace(",", "."));

export type Candidato = {
  numero: string; nome: string; partido: string; votos: number; pct: number;
  situacao: string; eleito: boolean; valido: boolean;
};

export type Resultado = {
  fonte: string; uf: string; cargo: number; atualizado: string; pctSecoes: number;
  secoes: number; secoesTotalizadas: number;
  eleitorado: number; comparecimento: number; pctAbstencao: number;
  brancos: number; pctBrancos: number; nulos: number; pctNulos: number;
  totalizacaoFinal: boolean; candidatos: Candidato[]; bruto: any;
};

export function normalizar(uf: string, cargo: number, j: any, fonte = ""): Resultado {
  // 2026 (-u.json): totais agrupados em s/e/v e candidatos aninhados por agremiação/partido.
  // 2022 (-r.json): tudo plano na raiz e lista `cand`.
  const aninhado = Array.isArray(j.carg);
  const S = aninhado ? j.s ?? {} : j;
  const E = aninhado ? j.e ?? {} : j;
  const V = aninhado ? j.v ?? {} : j;

  const brutos: { c: any; partido: string }[] = [];
  if (aninhado) {
    for (const cg of j.carg)
      for (const agr of cg.agr ?? [])
        for (const par of agr.par ?? [])
          for (const c of par.cand ?? []) brutos.push({ c, partido: String(par.sg ?? "") });
  } else {
    for (const c of j.cand ?? []) brutos.push({ c, partido: String(c.cc ?? "").split(" - ")[0] ?? "" });
  }

  const cands: Candidato[] = brutos.map(({ c, partido }) => {
    const st = String(c.st ?? "");
    return {
      numero: String(c.n ?? ""),
      nome: String(c.nmu ?? c.nm ?? "?"),
      partido,
      votos: num(c.vap),
      pct: num(c.pvap),
      situacao: st,
      eleito: c.e === "s" || (/eleito/i.test(st) && !/não/i.test(st)),
      valido: !c.dvt || /v[aá]lido/i.test(String(c.dvt)),
    };
  });
  cands.sort((a, b) => b.votos - a.votos || a.nome.localeCompare(b.nome));

  return {
    fonte, uf, cargo,
    atualizado: [j.dg, j.hg].filter(Boolean).join(" "),
    pctSecoes: num(S.pst),
    secoes: num(S.ts ?? S.s),
    secoesTotalizadas: num(S.st),
    eleitorado: num(aninhado ? E.te : E.e),
    comparecimento: num(E.c),
    pctAbstencao: num(E.pa),
    brancos: num(V.vb), pctBrancos: num(V.pvb),
    nulos: num(V.tvn ?? V.vn), pctNulos: num(V.ptvn ?? V.pvn),
    totalizacaoFinal: j.tf === "s",
    candidatos: cands,
    bruto: j,
  };
}

// ---- busca com fallback de padrão ----

const padraoOk = new Map<string, number>();

/** Busca o resultado de um cargo numa abrangência (br ou UF). `status` explica quando não há dados. */
export async function buscar(
  pleito: Pleito, uf: string, cargo: number,
): Promise<{ resultado?: Resultado; status: string }> {
  const ele = eleicaoDoCargo(pleito, cargo);
  if (!ele) return { status: `sem eleição para o cargo ${cargo} neste turno` };
  const opcoes = caminhos(pleito.ciclo, ele.cd, uf, cargo);
  const chave = `${ele.cd}|${uf}|${cargo}`;
  const fixo = padraoOk.get(chave);
  let status = "sem resposta";
  for (const i of fixo != null ? [fixo] : opcoes.map((_, i) => i)) {
    try {
      const r = await get(opcoes[i]!);
      if (r.status === 200 && r.json) {
        padraoOk.set(chave, i);
        return { resultado: normalizar(uf, cargo, r.json, r.url), status: "ok" };
      }
      status = `HTTP ${r.status}`;
    } catch (e) {
      status = `erro: ${(e as Error).message}`;
    }
  }
  return { status };
}

export const UFS = ["ac","al","am","ap","ba","ce","df","es","go","ma","mg","ms","mt","pa","pb","pe",
  "pi","pr","rj","rn","ro","rr","rs","sc","se","sp","to"];
