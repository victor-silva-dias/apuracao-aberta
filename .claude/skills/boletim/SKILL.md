---
name: boletim
description: Gera um boletim curto e compartilhável da apuração (o que mudou desde o boletim anterior), grava em registro/ e commita. Use para acompanhar a noite em intervalos; combina com /loop (ex. /loop 30m /boletim). Comando: /boletim [alvo...].
argument-hint: "[alvo...]"
allowed-tools: Bash(bun .claude/skills/apuracao/tse.ts:*), Bash(git add registro*), Bash(git commit:*), Read, Write, Glob
---

# /boletim: o que mudou, pronto para compartilhar

## Passos

1. **Ache o boletim anterior.** É o arquivo mais recente em `registro/ele2026-t1/boletins/`. O campo `capturado_em` do frontmatter dele é a base de comparação. Sem boletim anterior, este é o nº 1 e não há base.

2. **Capture com base.** Rode:
   ```bash
   bun .claude/skills/apuracao/tse.ts capturar $ARGUMENTS --desde <capturado_em do anterior>
   ```
   Sem boletim anterior, rode sem `--desde`. As linhas `mudou:` trazem o que mudou desde o boletim anterior.

3. **Escreva** `registro/ele2026-t1/boletins/<AAAA-MM-DD-HHMM>.md`:
   ```markdown
   ---
   n: <número>
   capturado_em: <ISO do momento desta captura>
   presidente_secoes_pct: <número>
   ---
   # Apuração Aberta · Boletim <n> · <HH:MM> (Brasília)

   **Presidente** (<x>% das seções, TSE <hh:mm>): <1º> <pct>, <2º> <pct>, <3º> <pct>. <situação do TSE, se houver>

   **Desde o boletim anterior:** <3 a 6 itens, os mais relevantes das linhas "mudou:">

   **Definido pelo TSE:** <quem o TSE já marcou como eleito ou indo ao 2º turno; omita se não houver nada>

   **Participação:** abstenção <x>%, brancos <x>%, nulos <x>% (Presidente, <x>% das seções)

   Resultados parciais. Fonte: TSE (resultados.tse.jus.br) · github.com/victor-silva-dias/apuracao-aberta
   ```
   - Até ~200 palavras. É texto para colar em mensagem: frases curtas, sem tabela.
   - Prioridade dentro de "Desde o boletim anterior": situação definida pelo TSE > mudança de liderança > início ou fim da apuração numa UF > avanço de seções.
   - Siga a doutrina do `CLAUDE.md`, especialmente nada de "deve vencer" e nada de adjetivo.

4. **Mostre** o boletim ao usuário exatamente como foi gravado.

5. **Grave no git:**
   ```bash
   git add registro && git commit -m "registro: boletim <n> (<HH:MM>)"
   ```
