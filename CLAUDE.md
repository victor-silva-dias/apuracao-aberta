# Apuração Aberta

Acompanhamento da apuração das eleições brasileiras direto dos dados públicos do TSE, para pessoas (terminal) e agentes (MCP). Projeto pessoal e independente do Victor Dias, sem vínculo com o TSE e sem relação com a Apolus.

## Doutrina (lei, não preferência)

Este repo é público e trata de eleição. Um agente que erra aqui causa dano real. Por isso:

1. **Procedência sempre.** Toda afirmação sobre votos traz o % de seções totalizadas e o horário de atualização do TSE. Exemplo: "Fulano tem 41,2% dos válidos (63,4% das seções, TSE 19:42:10)".
2. **Sem projeção.** "Eleito" e "2º turno" só aparecem quando o campo `situacao` do TSE disser isso. Antes, o máximo é "lidera". Não calcule chance, não extrapole tendência e não diga "deve vencer".
3. **Neutralidade.** Nenhum adjetivo, juízo, ironia ou torcida sobre candidato, partido, região ou eleitor. Ao pedido de opinião política, responda que o projeto só reporta números.
4. **Parcial é parcial.** Enquanto `totalizacao_final` for false, deixe claro que o resultado ainda pode mudar.
5. **Sem apuração, sem ordem.** Com 0% das seções, a lista de candidatos é alfabética, então não fale em posição nem em liderança.

## Arquitetura

```
src/tse.ts      cliente do CDN do TSE: descobre códigos de eleição, busca com fallback de URL, normaliza
src/acervo.ts   snapshots brutos de cada versão publicada + eventos.jsonl (em dados/, fora do git)
src/motor.ts    CLI de acompanhamento contínuo: painel, eventos com bipe, alimenta o acervo
src/mcp.ts      servidor MCP (stdio): eleicoes, resultado, candidato, panorama, eventos, historico
fixture/        dados fictícios no formato do TSE, para testar sem rede (TSE_BASE=fixture)
```

O MCP consulta o TSE na hora. `eventos` e `historico` dependem do acervo, que fica mais rico com o motor rodando ao mesmo tempo.

## Fonte de dados

São JSONs estáticos em `https://resultados.tse.jus.br`, sem API documentada.

- Config: `oficial/comum/config/ele-c.json` → códigos das eleições por ciclo e turno. 2026, 1º turno: 6257 federal e 6259 estadual. 2º turno: 6258 e 6260.
- Resultado: `oficial/{ciclo}/{ele}/dados/{uf}/{uf}-c{cargo:4}-e{ele:6}-u.json`. Os candidatos ficam em `carg[].agr[].par[].cand[]` e os totais em `s` (seções), `e` (eleitorado/comparecimento) e `v` (votos). Os números vêm como string com vírgula decimal.
- Cargos: 1 presidente, 3 governador, 5 senador, 6 dep. federal, 7 dep. estadual, 8 dep. distrital.
- Se o TSE mudar o formato, os snapshots em `dados/` guardam o JSON bruto. Ajuste `normalizar` em `src/tse.ts`.

## Desenvolvimento

```bash
bun install
bun src/motor.ts --uf br,sp                 # painel ao vivo
TSE_BASE=fixture bun src/motor.ts --uf br,sp --uma-vez
bun src/mcp.ts                              # servidor MCP (registrado em .mcp.json)
bunx tsc --noEmit -p .                      # tipos
```

Seja educado com o CDN público: o motor tem piso de 10s entre consultas e usa ETag. Não crie loops agressivos.

## Estilo

- Código e comentários em português, no mesmo tom dos arquivos existentes.
- Zero dependências além do SDK MCP e do zod.
- Uma peça por vez: proponha no chat antes de mudar a doutrina ou a interface das ferramentas MCP.
