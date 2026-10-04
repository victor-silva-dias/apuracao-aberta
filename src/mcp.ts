// Servidor MCP da Apuração Aberta: expõe a apuração do TSE como ferramentas para agentes.
// Consulta o TSE na hora (com ETag) e lê o acervo local que o motor alimenta.
//
// Uso: bun src/mcp.ts   (stdio)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { lerEventos, lerSerie, salvarSnapshot } from "./acervo.ts";
import { CARGOS, UFS, buscar, descobrirPleito, type ChaveCargo, type Pleito, type Resultado } from "./tse.ts";

const CICLO = process.env.APURACAO_CICLO ?? "ele2026";
const TURNO_PADRAO = process.env.APURACAO_TURNO ?? "1";

const DOUTRINA = `Apuração Aberta: resultados oficiais do TSE (resultados.tse.jus.br), projeto independente sem vínculo com o TSE.
Regras ao usar estas ferramentas:
1. Procedência sempre: toda afirmação sobre votos traz o % de seções totalizadas e o horário de atualização do TSE (campo procedencia).
2. Sem projeção: "eleito" ou "2º turno" só quando o campo situacao do TSE disser. Antes disso, diga "lidera com X% com Y% das seções apuradas".
3. Neutralidade: nenhum adjetivo, juízo ou torcida sobre candidato, partido ou eleitor. Números e fatos.
4. Parcial é parcial: enquanto totalizacao_final for false, deixe claro que o resultado pode mudar.`;

const cachePleito = new Map<string, { pleito: Pleito; em: number }>();
async function pleitoDo(turno: string): Promise<Pleito> {
  const c = cachePleito.get(turno);
  if (c && Date.now() - c.em < 10 * 60_000) return c.pleito;
  const pleito = await descobrirPleito(CICLO, turno);
  cachePleito.set(turno, { pleito, em: Date.now() });
  return pleito;
}

const cargoEnum = z.enum(Object.keys(CARGOS) as [ChaveCargo, ...ChaveCargo[]]);
const ufSchema = z.string().toLowerCase().refine((u) => u === "br" || UFS.includes(u), "use 'br' ou sigla de UF");
const turnoSchema = z.enum(["1", "2"]).optional().describe("turno; padrão 1");

function cargoCd(chave: ChaveCargo, uf: string): number {
  if (uf === "df" && chave === "depest") return CARGOS.depdist.cd;
  return CARGOS[chave].cd;
}

const procedencia = (r: Resultado) => ({
  fonte: r.fonte,
  atualizado_tse: r.atualizado,
  secoes_totalizadas_pct: r.pctSecoes,
  secoes: `${r.secoesTotalizadas}/${r.secoes}`,
  totalizacao_final: r.totalizacaoFinal,
  apuracao_iniciada: r.secoesTotalizadas > 0,
});

// Sem seções apuradas, a ordem é alfabética: posição seria uma liderança que não existe.
const posicao = (r: Resultado, i: number) => (r.secoesTotalizadas > 0 ? i + 1 : null);

const resumoCand = (r: Resultado, top: number) =>
  r.candidatos.slice(0, top).map((c, i) => ({
    pos: posicao(r, i), numero: c.numero, nome: c.nome, partido: c.partido,
    votos: c.votos, pct_validos: c.pct, situacao: c.situacao || null,
  }));

const json = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o, null, 2) }] });
const falha = (msg: string) => ({ content: [{ type: "text" as const, text: msg }], isError: true });

async function obter(uf: string, cargo: ChaveCargo, turno: string) {
  const pleito = await pleitoDo(turno);
  const { resultado, status } = await buscar(pleito, uf, cargoCd(cargo, uf));
  if (resultado) await salvarSnapshot(resultado).catch(() => {});
  return { resultado, status };
}

const server = new McpServer({ name: "apuracao-aberta", version: "0.1.0" }, { instructions: DOUTRINA });

server.registerTool("eleicoes", {
  description: "Lista o pleito em curso: data, turno, eleições e cargos disponíveis, UFs. Comece por aqui se não souber os códigos.",
  inputSchema: { turno: turnoSchema },
}, async ({ turno }) => {
  const p = await pleitoDo(turno ?? TURNO_PADRAO);
  return json({
    ciclo: p.ciclo, data: p.data, turno: turno ?? TURNO_PADRAO,
    eleicoes: p.eleicoes.map((e) => ({
      codigo: e.cd, nome: e.nome,
      cargos: Object.entries(CARGOS).filter(([, c]) => e.cargos.includes(c.cd)).map(([k]) => k),
    })),
    abrangencias: ["br (só presidente)", ...UFS],
  });
});

server.registerTool("resultado", {
  description: "Resultado atual de um cargo numa abrangência (br para presidente nacional, ou sigla da UF). Consulta o TSE na hora.",
  inputSchema: {
    uf: ufSchema.describe("'br' ou sigla da UF, ex: sp"),
    cargo: cargoEnum,
    top: z.number().int().min(1).max(100).optional().describe("quantos candidatos; padrão 10"),
    turno: turnoSchema,
  },
}, async ({ uf, cargo, top, turno }) => {
  if (uf === "br" && cargo !== "presidente") return falha("abrangência 'br' só existe para presidente");
  const { resultado: r, status } = await obter(uf, cargo, turno ?? TURNO_PADRAO);
  if (!r) return json({ uf, cargo, disponivel: false, status, nota: "TSE ainda não publicou (divulgação começa após 17h de Brasília)" });
  return json({
    uf, cargo: CARGOS[cargo].nome,
    procedencia: procedencia(r),
    comparecimento: r.comparecimento, eleitorado: r.eleitorado,
    abstencao_pct: r.pctAbstencao, brancos_pct: r.pctBrancos, nulos_pct: r.pctNulos,
    total_candidatos: r.candidatos.length,
    candidatos: resumoCand(r, top ?? 10),
  });
});

server.registerTool("candidato", {
  description: "Procura candidato(s) por nome ou número de urna e devolve posição, votos e situação. Busca nos cargos majoritários (e deputados, se pedido) da abrangência.",
  inputSchema: {
    busca: z.string().min(2).describe("nome (parcial, sem acento ok) ou número"),
    uf: ufSchema.describe("'br' ou UF onde procurar"),
    cargos: z.array(cargoEnum).optional().describe("padrão: presidente, governador, senador"),
    turno: turnoSchema,
  },
}, async ({ busca, uf, cargos, turno }) => {
  const alvo = (cargos ?? (["presidente", "governador", "senador"] as ChaveCargo[])).filter((c) => uf !== "br" || c === "presidente");
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const q = norm(busca);
  const achados: object[] = [];
  for (const cargo of alvo) {
    const { resultado: r } = await obter(uf, cargo, turno ?? TURNO_PADRAO);
    if (!r) continue;
    r.candidatos.forEach((c, i) => {
      if (c.numero === busca || norm(c.nome).includes(q)) {
        achados.push({
          cargo: CARGOS[cargo].nome, uf, pos: posicao(r, i), de: r.candidatos.length,
          numero: c.numero, nome: c.nome, partido: c.partido, votos: c.votos, pct_validos: c.pct,
          situacao: c.situacao || null, procedencia: procedencia(r),
        });
      }
    });
  }
  return json(achados.length ? achados : { nada: `nenhum candidato com '${busca}' em ${alvo.join(", ")} (${uf})` });
});

server.registerTool("panorama", {
  description: "Quem lidera um cargo em cada UF (governador, senador ou presidente por estado). Útil para visão nacional.",
  inputSchema: {
    cargo: z.enum(["presidente", "governador", "senador"]),
    ufs: z.array(ufSchema).optional().describe("padrão: todas as 27"),
    turno: turnoSchema,
  },
}, async ({ cargo, ufs, turno }) => {
  const lista = (ufs ?? UFS).filter((u) => u !== "br");
  const linhas: unknown[] = [];
  for (let i = 0; i < lista.length; i += 6) {
    const lote = await Promise.all(lista.slice(i, i + 6).map(async (uf) => {
      const { resultado: r, status } = await obter(uf, cargo, turno ?? TURNO_PADRAO);
      if (!r) return { uf, disponivel: false, status };
      return {
        uf, secoes_pct: r.pctSecoes, atualizado_tse: r.atualizado, final: r.totalizacaoFinal,
        lideres: r.secoesTotalizadas > 0 ? resumoCand(r, cargo === "senador" ? 3 : 2) : "apuração não iniciada",
      };
    }));
    linhas.push(...lote);
  }
  return json({ cargo: CARGOS[cargo].nome, ufs: linhas });
});

server.registerTool("eventos", {
  description: "Eventos detectados pelo motor (início da apuração, mudança de liderança, marcos de % de seções, situação definida pelo TSE). Só existe se o motor estiver rodando.",
  inputSchema: {
    desde: z.string().optional().describe("ISO 8601; só eventos depois disso"),
    limite: z.number().int().min(1).max(500).optional().describe("padrão 30, mais recentes"),
  },
}, async ({ desde, limite }) => {
  const ev = await lerEventos(desde);
  if (!ev.length) return json({ eventos: [], nota: "nenhum evento; o motor (bun src/motor.ts) está rodando?" });
  return json({ eventos: ev.slice(-(limite ?? 30)) });
});

server.registerTool("historico", {
  description: "Evolução de um cargo ao longo da apuração, a partir do acervo local (cada versão publicada pelo TSE que o motor ou o MCP viu).",
  inputSchema: {
    uf: ufSchema, cargo: cargoEnum,
    top: z.number().int().min(1).max(10).optional().describe("candidatos acompanhados; padrão 3 (os líderes atuais)"),
    pontos: z.number().int().min(2).max(200).optional().describe("máximo de pontos na série; padrão 20"),
  },
}, async ({ uf, cargo, top, pontos }) => {
  const serie = (await lerSerie(uf, cargoCd(cargo, uf))).filter((r) => r.secoesTotalizadas > 0);
  if (!serie.length) return json({ serie: [], nota: "acervo vazio para esse cargo; rode o motor ou consulte 'resultado' algumas vezes" });
  const ultimos = serie.at(-1)!;
  const nomes = ultimos.candidatos.slice(0, top ?? 3).map((c) => c.nome);
  const n = pontos ?? 20;
  const passo = Math.max(1, Math.ceil(serie.length / n));
  const amostra = serie.filter((_, i) => i % passo === 0 || i === serie.length - 1);
  return json({
    uf, cargo: CARGOS[cargo].nome, acompanhando: nomes, versoes_no_acervo: serie.length,
    serie: amostra.map((r) => ({
      atualizado_tse: r.atualizado, secoes_pct: r.pctSecoes,
      pct: Object.fromEntries(nomes.map((nm) => [nm, r.candidatos.find((c) => c.nome === nm)?.pct ?? null])),
    })),
  });
});

await server.connect(new StdioServerTransport());
