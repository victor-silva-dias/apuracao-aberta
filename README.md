# Apuração Aberta

> Projeto independente e não oficial. Não tem vínculo com o Tribunal Superior Eleitoral. Os resultados oficiais estão em [resultados.tse.jus.br](https://resultados.tse.jus.br).

Um harness de [Claude Code](https://claude.com/claude-code) para acompanhar a apuração das eleições brasileiras conversando. Você digita uma skill, o agente busca os dados atualizados direto do TSE (ou da imprensa), grava tudo neste repo e responde com procedência. Ao fim da noite, a pasta `registro/` guarda a história da apuração: cada versão publicada pelo TSE, cada boletim, cada checagem.

## Como usar

Requer [Claude Code](https://claude.com/claude-code) e [Bun](https://bun.sh).

```bash
git clone https://github.com/victor-silva-dias/apuracao-aberta
cd apuracao-aberta
claude
```

E dentro do Claude Code:

```
/apuracao                     Presidente + governadores e Senado nas 27 UFs
/apuracao sp:governador       um cargo numa UF
/boletim                      o que mudou desde o último boletim, pronto para compartilhar
/loop 30m /boletim            um boletim a cada 30 minutos
/checar fulano já está eleito confere com o TSE?
/imprensa Senado em MG        o que a imprensa está reportando, com números conferidos
```

Alvos: `br`, a sigla da UF (`sp`) ou UF com cargos (`sp:governador,senador`). Cargos: `presidente`, `governador`, `senador`, `depfed`, `depest`, `depdist`. Para o 2º turno, peça ao agente para usar o turno 2.

## O que fica gravado

```
registro/ele2026-t1/
  tse/<uf>-<cargo>/<horário-do-TSE>.json   cada versão publicada pelo TSE
  boletins/<data-hora>.md                   boletins
  checagens/<data-hora>-<tema>.md           checagens
  imprensa/<data-hora>-<tema>.md            leituras da imprensa
```

Cada skill termina com um commit local, então o histórico do git é a linha do tempo da noite.

## Princípios

O `CLAUDE.md` define a doutrina que o agente segue:

1. **Procedência sempre:** número sem % de seções e horário do TSE não é informação.
2. **Sem projeção:** "eleito" e "2º turno" só aparecem quando o TSE marca.
3. **Neutralidade:** números e fatos atribuídos, sem adjetivo sobre candidato ou eleitor.
4. **Parcial é parcial:** até a totalização final, tudo pode mudar.
5. **Número vem do TSE:** a imprensa contextualiza, mas não é fonte de números.

## Imprensa

A skill `/imprensa` lê só as fontes de [`fontes.md`](.claude/skills/imprensa/fontes.md). A lista não usa o rótulo "imparcial". Usa critérios explícitos (cobertura factual, política de correção, separação entre notícia e opinião, IFCN ou Comprova para checagem) e reúne de propósito veículos de linhas editoriais diferentes. A skill cruza pelo menos três veículos, mostra as divergências sem escolher lado e confere os números contra o TSE. Quer propor uma fonte? Abra um PR justificando pelos critérios.

## Como funciona

O TSE não tem uma API documentada de resultados. O app oficial lê arquivos JSON estáticos de um CDN público, e este projeto lê os mesmos arquivos. O único código do repo é [`tse.ts`](.claude/skills/apuracao/tse.ts), que busca, normaliza e grava. Todo o resto é texto: skills, um subagente e a doutrina.

## Licença

MIT © Victor Dias
