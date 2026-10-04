# Apuração Aberta

> Projeto independente e não oficial. Não tem vínculo com o Tribunal Superior Eleitoral. Os resultados oficiais estão em [resultados.tse.jus.br](https://resultados.tse.jus.br).

Acompanhe a apuração das eleições brasileiras direto dos dados públicos do TSE, sem intermediário. A ferramenta tem dois usos:

- **Para você:** um painel no terminal que se atualiza sozinho e avisa com bipe quando algo relevante acontece.
- **Para agentes:** um servidor [MCP](https://modelcontextprotocol.io) para perguntar a um assistente de IA "como está o Senado em MG?" e receber números com procedência.

```
Apuração Aberta · Eleições 04/10/2026, 1º turno   19:42:31 · próxima consulta 19:43:01

BR · Presidente  63,40% das seções (316.523/499.248)  TSE 04/10/2026 19:42:10
   1. 00    CANDIDATO                    PARTIDO          12.345.678   41,20%  ██████████··············
   …
Eventos
  19:40:02  SP · Governador: 50% das seções totalizadas; lidera …
```

## Começando

Requer [Bun](https://bun.sh).

```bash
git clone https://github.com/victor-silva-dias/apuracao-aberta
cd apuracao-aberta
bun install

bun src/motor.ts --uf br,sp          # Presidente (Brasil) + Presidente, Governador e Senador (SP)
bun run demo                          # dados fictícios, sem rede
```

### Opções do motor

| Opção | Padrão | O que faz |
|---|---|---|
| `--uf br,sp,mg` | `br` | abrangências: `br` (só presidente) ou siglas de UF |
| `--cargos governador,senador` | majoritários | `presidente`, `governador`, `senador`, `depfed`, `depest`, `depdist` |
| `--intervalo 30` | `30` | segundos entre consultas (mínimo 10) |
| `--top 6` | `6` | candidatos por painel |
| `--turno 2` | `1` | turno |
| `--uma-vez` | | consulta uma vez e sai |
| `--descobrir` | | testa as URLs do TSE e mostra o status HTTP |

Cada versão nova publicada pelo TSE é salva em `dados/snapshots/`, e os eventos vão para `dados/eventos.jsonl`. Assim você tem o histórico da noite para analisar depois.

**Eventos detectados:** apuração começou, mudança de liderança, marcos de 10/25/50/75/90/99/100% das seções, candidato marcado como eleito ou indo para o 2º turno (só quando o TSE marca) e totalização final.

## Servidor MCP

```bash
bun src/mcp.ts
```

O `.mcp.json` já registra o servidor para o Claude Code: basta abrir o repo. Em outros clientes, use `command: "bun"` e `args: ["<caminho>/src/mcp.ts"]`.

| Ferramenta | Para quê |
|---|---|
| `eleicoes` | pleito em curso, códigos e cargos disponíveis |
| `resultado` | resultado atual de um cargo numa UF (ou `br`) |
| `candidato` | busca por nome ou número; posição, votos e situação |
| `panorama` | quem lidera governador, senador ou presidente em cada UF |
| `eventos` | eventos detectados pelo motor |
| `historico` | evolução de um cargo ao longo da apuração (do acervo local) |

Toda resposta traz um bloco `procedencia` com a URL do arquivo do TSE, o horário de atualização e o % de seções totalizadas.

## Princípios

O servidor envia estas regras como instruções a todo agente que se conecta:

1. **Procedência sempre:** número sem % de seções e horário do TSE não é informação.
2. **Sem projeção:** "eleito" e "2º turno" só aparecem quando o TSE marca.
3. **Neutralidade:** números e fatos, sem adjetivo sobre candidato ou eleitor.
4. **Parcial é parcial:** até a totalização final, tudo pode mudar.

## Como funciona

O TSE não tem uma API documentada de resultados. O app oficial lê arquivos JSON estáticos de um CDN público, e este projeto lê os mesmos arquivos:

- `oficial/comum/config/ele-c.json` traz os códigos de cada eleição, que o motor descobre sozinho.
- `oficial/{ciclo}/{eleição}/dados/{uf}/{uf}-c{cargo}-e{eleição}-u.json` traz o resultado por cargo e abrangência.

As consultas usam ETag e respeitam um intervalo mínimo, para não sobrecarregar um serviço público em dia de eleição.

## Licença

MIT © Victor Dias
