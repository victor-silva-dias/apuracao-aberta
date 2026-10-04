// Acervo local: snapshots brutos de cada versão publicada pelo TSE e log de eventos.
// É o que permite responder "como evoluiu" depois — o TSE só expõe o estado atual.

import { appendFile, mkdir, readdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { normalizar, type Resultado } from "./tse.ts";

export const DADOS = process.env.APURACAO_DADOS ?? join(import.meta.dir, "..", "dados");

const dirSerie = (uf: string, cargo: number) => join(DADOS, "snapshots", `${uf}-c${cargo}`);

/** "04/10/2026" + "18:42:10" → "2026-10-04T18-42-10" (ordenável). */
function carimbo(r: Resultado): string {
  const [d, h] = r.atualizado.split(" ");
  const [dd, mm, aaaa] = (d ?? "").split("/");
  return aaaa ? `${aaaa}-${mm}-${dd}T${(h ?? "").replace(/:/g, "-")}` : new Date().toISOString().replace(/:/g, "-");
}

/** Grava a versão se ainda não existe. Retorna true quando é nova. */
export async function salvarSnapshot(r: Resultado): Promise<boolean> {
  const dir = dirSerie(r.uf, r.cargo);
  const arq = join(dir, `${carimbo(r)}.json`);
  try { await access(arq); return false; } catch {}
  await mkdir(dir, { recursive: true });
  await writeFile(arq, JSON.stringify(r.bruto));
  return true;
}

export async function lerSerie(uf: string, cargo: number): Promise<Resultado[]> {
  const dir = dirSerie(uf, cargo);
  let nomes: string[];
  try { nomes = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort(); } catch { return []; }
  const serie: Resultado[] = [];
  for (const n of nomes) serie.push(normalizar(uf, cargo, JSON.parse(await readFile(join(dir, n), "utf8")), join(dir, n)));
  return serie;
}

export type Evento = { quando: string; uf: string; cargo: string; msg: string };

export async function registrarEvento(e: Evento) {
  await mkdir(DADOS, { recursive: true });
  await appendFile(join(DADOS, "eventos.jsonl"), JSON.stringify(e) + "\n");
}

export async function lerEventos(desde?: string): Promise<Evento[]> {
  let txt = "";
  try { txt = await readFile(join(DADOS, "eventos.jsonl"), "utf8"); } catch { return []; }
  const todos = txt.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Evento);
  return desde ? todos.filter((e) => e.quando > desde) : todos;
}
