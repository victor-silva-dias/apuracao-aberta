---
name: checar
description: Confere uma afirmação sobre a eleição contra os dados do TSE (ex. "fulano já está eleito", "a abstenção passou de 25%") e grava a checagem em registro/. Use quando o usuário colar algo que viu em rede social, grupo ou notícia. Comando: /checar {afirmação}.
argument-hint: "{afirmação}"
allowed-tools: Bash(bun .claude/skills/apuracao/tse.ts:*), Bash(git add registro*), Bash(git commit:*), Read, Write, Glob, Grep, WebSearch, WebFetch
---

# /checar: a afirmação confere com o TSE?

Afirmação: **$ARGUMENTS**

## Passos

1. **Decomponha** a afirmação em partes verificáveis: quem, qual cargo, qual UF, qual número ou situação. Se houver mais de uma afirmação, cheque cada uma.

2. **Capture** o que é necessário (ex. `sp:governador`, `br`):
   ```bash
   bun .claude/skills/apuracao/tse.ts capturar <alvos>
   ```
   Para afirmações sobre "evolução" ("virou", "estava na frente às 19h"), leia as versões gravadas em `registro/ele2026-t1/tse/<uf>-<cargo>/`.

3. **Dê o veredito** de cada parte, com uma destas quatro etiquetas:
   - **CONFERE**: os dados do TSE sustentam a afirmação.
   - **NÃO CONFERE**: os dados do TSE contradizem. Mostre o número real.
   - **AINDA NÃO É POSSÍVEL SABER**: a apuração não chegou lá. Exemplo: "eleito" sem o TSE ter marcado, com X% das seções.
   - **FORA DO ALCANCE DOS DADOS**: afirmações sobre fraude, urna, conduta de pessoas, pesquisas. Não especule. Diga o que os dados de resultado mostram (se algo) e procure checagens publicadas nas fontes de checagem do `.claude/skills/imprensa/fontes.md` (WebSearch com `allowed_domains`). Se houver, cite-as. Se não houver, aponte o canal oficial: Fato ou Boato da Justiça Eleitoral.

   Cada veredito vem com a procedência (% de seções e horário do TSE, ou o link da checagem).

4. **Grave** `registro/ele2026-t1/checagens/<AAAA-MM-DD-HHMM>-<slug-curto>.md`:
   ```markdown
   ---
   afirmacao: "<texto original>"
   checado_em: <ISO>
   vereditos: [<etiqueta>, ...]
   ---
   # Checagem: <afirmação resumida>

   <por parte: afirmação → veredito → dado com procedência>

   Fonte dos números: TSE (resultados.tse.jus.br). Resultados parciais podem mudar.
   ```

5. **Mostre** o veredito ao usuário, curto e na ordem: etiqueta, dado, procedência.

6. **Grave no git:** `git add registro && git commit -m "registro: checagem <slug>"`.

## Cuidados

- A pessoa pode ter lido algo verdadeiro num momento anterior da apuração. Se a afirmação conferia antes e não confere mais, diga isso usando o histórico.
- Nunca diga que alguém mentiu. Diga o que os dados mostram.
