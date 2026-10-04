---
name: apuracao
description: Captura agora os resultados do TSE, grava no registro do repo e mostra o retrato da apuração com procedência. Use quando o usuário quiser saber como está a apuração, de um cargo ou de uma UF. Comando: /apuracao [alvo...] — alvo = br | sp | sp:governador | sp:senador,depfed | todos.
argument-hint: "[br | sp | sp:governador | todos]"
allowed-tools: Bash(bun .claude/skills/apuracao/tse.ts:*), Bash(git add registro*), Bash(git commit:*), Read
---

# /apuracao: o retrato de agora

Captura, grava, mostra. Sem opinião e sem previsão.

## Passos

1. **Capture.** Rode:
   ```bash
   bun .claude/skills/apuracao/tse.ts capturar $ARGUMENTS
   ```
   Sem argumento, o script captura Presidente (BR) e Governador + Senador nas 27 UFs. Cada versão nova do TSE é gravada em `registro/ele2026-t1/tse/<uf>-<cargo>/`. No 2º turno (25/10), acrescente `--turno 2`.

2. **Mostre** seguindo a doutrina do `CLAUDE.md`:
   - Comece pelo que o usuário pediu. Sem alvo, comece por Presidente.
   - Todo número sai com o % de seções e o horário do TSE da própria linha.
   - Na captura completa, não despeje as 55 linhas. Mostre Presidente e depois **só o que tem notícia**: situações marcadas pelo TSE ("Eleito", "2º turno"), mudanças de liderança e UFs perto do fim (acima de 90% das seções). Termine dizendo que o resto está no registro e pode ser detalhado.
   - Se a linha diz "apuração não iniciada", diga isso. Não liste candidatos como se houvesse ordem.
   - Se o script disser "TSE ainda não publicou", explique que a divulgação começa após as 17h de Brasília.

3. **Grave no git** se o script disser que gravou registros novos:
   ```bash
   git add registro && git commit -m "registro: captura TSE <HH:MM> (<N> novos)"
   ```
   Commit local apenas. Push só quando o usuário pedir.

## Para consultar sem rede

`bun .claude/skills/apuracao/tse.ts ver <alvo>` lê o último registro gravado. Para a evolução de um cargo, leia os JSONs da pasta dele em ordem: cada arquivo é uma versão publicada pelo TSE.
