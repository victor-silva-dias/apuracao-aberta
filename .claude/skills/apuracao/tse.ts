// Captura de resultados do TSE para as skills da Apuração Aberta.
// Busca os JSONs públicos de resultados.tse.jus.br, normaliza e grava em registro/ (versionado).
//
//   bun .claude/skills/apuracao/tse.ts capturar [alvo...] [--desde ISO] [--turno 2]
//   bun .claude/skills/apuracao/tse.ts ver [alvo...]
//
// Alvo: br | sp | sp:governador | sp:senador,depfed | todos
// Sem alvo: br:presidente + governador e senador nas 27 UFs.
// `capturar` grava só versões novas e imprime o que mudou desde a anterior (ou desde --desde).
// `ver` lê o último registro, sem rede.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://resultados.tse.jus.br/oficial";
const CICLO = "ele2026";
const RAIZ = join(import.meta.dir, "..", "..", "..");

const CARGOS = {
  presidente: 1, governador: 3, senador: 5, depfed: 6, depest: 7, depdist: 8,
} as const;
type Cargo = keyof typeof CARGOS;
const UFS = ["ac","al","am","ap","ba","ce","df","es","go","ma","mg","ms","mt","pa","pb","pe",
  "pi","pr","rj","rn","ro","rr","rs","sc","se","sp","to"];
const TOP: Record<Cargo, number> = { presidente: 4, governador: 3, senador: 4, depfed: 10, depest: 10, depdist: 10 };

// ---- argumentos ----

const [cmd = "capturar", ...resto] = process.argv.slice(2);
const flag = (n: string) => { const i = resto.indexOf(`--${n}`); return i >= 0 ? resto.splice(i, 2)[1] : undefined; };
const TURNO = flag("turno") ?? "1";
const DESDE = flag("desde");
const DIR = join(RAIZ, "registro", `${CICLO}-t${TURNO}`, "tse");

type Alvo = { uf: string; cargo: Cargo };

function alvos(args: string[]): Alvo[] {
  if (!args.length) return [{ uf: "br", cargo: "presidente" },
    ...UFS.flatMap((uf) => (["governador", "senador"] as Cargo[]).map((cargo) => ({ uf, cargo })))];
  const out: Alvo[] = [];
  for (const a of args) {
    const [uf = "", lista] = a.toLowerCase().split(":");
    const ufs = uf === "todos" ? UFS : [uf];
    for (const u of ufs) {
      if (u !== "br" && !UFS.includes(u)) throw new Error(`UF inválida: ${u}`);
      const cargos = lista ? lista.split(",") : u === "br" ? ["presidente"] : ["presidente", "governador", "senador"];
      for (let c of cargos) {
        if (u === "df" && c === "depest") c = "depdist";
        if (!(c in CARGOS)) throw new Error(`cargo inválido: ${c} (${Object.keys(CARGOS).join(", ")})`);
        if (u === "br" && c !== "presidente") continue;
        out.push({ uf: u, cargo: c as Cargo });
      }
    }
  }
  return out;
}

// ---- TSE ----

const num = (v: any) => (v == null || v === "" ? 0 : Number(String(v).replace(/\./g, "").replace(",", ".")));

async function getJson(url: string): Promise<any | undefined> {
  const r = await fetch(url, {
    headers: { "user-agent": "apuracao-aberta (+https://github.com/victor-silva-dias/apuracao-aberta)" },
    signal: AbortSignal.timeout(20_000),
  });
  return r.ok ? r.json() : undefined;
}

// Código da eleição por cargo, lido uma vez da config do TSE (promessa compartilhada entre buscas paralelas).
let codigos: Promise<Record<number, string>> | undefined;
async function eleicaoDo(cargo: number): Promise<string | undefined> {
  codigos ??= getJson(`${BASE}/comum/config/ele-c.json`).then((cfg) => {
    const m: Record<number, string> = {};
    for (const p of cfg?.pl ?? []) {
      if (p.c !== CICLO) continue;
      for (const e of p.e) {
        if (e.t !== TURNO || e.tp === "7") continue;
        for (const a of e.abr ?? []) for (const c of a.cp ?? []) m[Number(c.cd)] ??= e.cd;
      }
    }
    return m;
  });
  return (await codigos)[cargo];
}

type Cand = { numero: string; nome: string; partido: string; votos: number; pct: number; situacao: string };
type Registro = {
  uf: string; cargo: Cargo; capturado_em: string;
  procedencia: { fonte: string; atualizado_tse: string; secoes_pct: number; secoes: string; totalizacao_final: boolean };
  comparecimento: number; abstencao_pct: number; brancos_pct: number; nulos_pct: number;
  candidatos: Cand[];
};

async function buscar(a: Alvo): Promise<Registro | string> {
  const ele = await eleicaoDo(CARGOS[a.cargo]);
  if (!ele) return "sem eleição para esse cargo neste turno";
  const c = String(CARGOS[a.cargo]).padStart(4, "0"), e = ele.padStart(6, "0");
  const fonte = `${BASE}/${CICLO}/${ele}/dados/${a.uf}/${a.uf}-c${c}-e${e}-u.json`;
  const j = await getJson(fonte).catch((err) => { throw new Error(`${fonte}: ${err.message}`); });
  if (!j) return "TSE ainda não publicou";
  const s = j.s ?? {}, el = j.e ?? {}, v = j.v ?? {};
  const candidatos: Cand[] = [];
  for (const cg of j.carg ?? []) for (const ag of cg.agr ?? []) for (const par of ag.par ?? []) for (const k of par.cand ?? [])
    candidatos.push({ numero: String(k.n), nome: String(k.nmu ?? k.nm), partido: String(par.sg ?? ""),
      votos: num(k.vap), pct: num(k.pvap), situacao: String(k.st ?? "") });
  candidatos.sort((x, y) => y.votos - x.votos || x.nome.localeCompare(y.nome));
  return {
    uf: a.uf, cargo: a.cargo, capturado_em: new Date().toISOString(),
    procedencia: { fonte, atualizado_tse: `${j.dg} ${j.hg}`, secoes_pct: num(s.pst),
      secoes: `${num(s.st)}/${num(s.ts)}`, totalizacao_final: j.tf === "s" },
    comparecimento: num(el.c), abstencao_pct: num(el.pa), brancos_pct: num(v.pvb), nulos_pct: num(v.ptvn),
    candidatos,
  };
}

// ---- registro ----

const pasta = (a: Alvo) => join(DIR, `${a.uf}-${a.cargo}`);
const carimbo = (r: Registro) => {
  const [d = "", h = ""] = r.procedencia.atualizado_tse.split(" ");
  const [dd, mm, aaaa] = d.split("/");
  return `${aaaa}-${mm}-${dd}T${h.replace(/:/g, "")}`;
};

async function historico(a: Alvo): Promise<Registro[]> {
  let nomes: string[] = [];
  try { nomes = (await readdir(pasta(a))).filter((n) => n.endsWith(".json")).sort(); } catch {}
  return Promise.all(nomes.map(async (n) => JSON.parse(await readFile(join(pasta(a), n), "utf8")) as Registro));
}

const iniciou = (r: Registro) => r.procedencia.secoes_pct > 0;

function mudancas(antes: Registro | undefined, agora: Registro): string[] {
  if (!antes) return ["primeiro registro"];
  const m: string[] = [];
  const d = agora.procedencia.secoes_pct - antes.procedencia.secoes_pct;
  if (d) m.push(`seções ${pct(antes.procedencia.secoes_pct)} → ${pct(agora.procedencia.secoes_pct)}`);
  if (!iniciou(antes) && iniciou(agora)) m.push("apuração começou");
  if (iniciou(antes) && iniciou(agora) && antes.candidatos[0]?.nome !== agora.candidatos[0]?.nome)
    m.push(`liderança: ${antes.candidatos[0]?.nome} → ${agora.candidatos[0]?.nome}`);
  for (const c of agora.candidatos) {
    const ant = antes.candidatos.find((x) => x.numero === c.numero);
    if (c.situacao && c.situacao !== ant?.situacao) m.push(`${c.nome}: ${c.situacao} (TSE)`);
  }
  if (agora.procedencia.totalizacao_final && !antes.procedencia.totalizacao_final) m.push("totalização final");
  return m;
}

// ---- saída ----

const pct = (n: number) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const int = (n: number) => n.toLocaleString("pt-BR");

function linha(r: Registro, estado: string, m: string[]): string {
  const p = r.procedencia;
  const cab = `${r.uf.toUpperCase()} ${r.cargo} · ${pct(p.secoes_pct)} seções (${p.secoes}) · TSE ${p.atualizado_tse}` +
    `${p.totalizacao_final ? " · FINAL" : ""} · ${estado}`;
  const corpo = iniciou(r)
    ? r.candidatos.slice(0, TOP[r.cargo]).map((c, i) =>
        `  ${i + 1}. ${c.nome} (${c.partido}, ${c.numero}) ${pct(c.pct)} · ${int(c.votos)} votos${c.situacao ? ` · ${c.situacao}` : ""}`)
    : [`  apuração não iniciada · ${r.candidatos.length} candidatos (ordem alfabética, sem posição)`];
  if (iniciou(r)) corpo.push(`  abstenção ${pct(r.abstencao_pct)} · brancos ${pct(r.brancos_pct)} · nulos ${pct(r.nulos_pct)}`);
  if (m.length) corpo.push(`  mudou: ${m.join("; ")}`);
  return [cab, ...corpo].join("\n");
}

async function capturar(lista: Alvo[]) {
  const agora = new Date();
  console.log(`CAPTURA ${agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília) · turno ${TURNO}` +
    `${DESDE ? ` · mudanças desde ${DESDE}` : ""}\n`);
  let novos = 0;
  for (let i = 0; i < lista.length; i += 6) {
    const lote = await Promise.all(lista.slice(i, i + 6).map(async (a) => {
      const r = await buscar(a).catch((e) => `erro: ${(e as Error).message}`);
      if (typeof r === "string") return `${a.uf.toUpperCase()} ${a.cargo} · ${r}`;
      const hist = await historico(a);
      const anterior = hist.at(-1);
      const base = DESDE ? hist.filter((h) => h.capturado_em <= DESDE).at(-1) : anterior;
      const novo = anterior?.procedencia.atualizado_tse !== r.procedencia.atualizado_tse;
      if (novo) {
        await mkdir(pasta(a), { recursive: true });
        await writeFile(join(pasta(a), `${carimbo(r)}.json`), JSON.stringify(r, null, 1));
        novos++;
      }
      return linha(r, novo ? "NOVO" : "sem atualização", DESDE || novo ? mudancas(base, r) : []);
    }));
    console.log(lote.join("\n\n") + "\n");
  }
  console.log(`${novos} registro(s) novo(s) gravado(s) em registro/${CICLO}-t${TURNO}/tse/`);
}

async function ver(lista: Alvo[]) {
  for (const a of lista) {
    const r = (await historico(a)).at(-1);
    console.log(r ? linha(r, `registro de ${r.capturado_em}`, []) : `${a.uf.toUpperCase()} ${a.cargo} · sem registro`);
    console.log();
  }
}

const lista = alvos(resto);
if (cmd === "capturar") await capturar(lista);
else if (cmd === "ver") await ver(lista);
else { console.error(`comando desconhecido: ${cmd} (use capturar ou ver)`); process.exit(1); }
