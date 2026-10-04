# Fontes de imprensa

A skill `/imprensa` lê **apenas** os domínios desta lista. Mudanças entram por pull request, com justificativa a partir dos critérios abaixo.

## Por que não "imparcial"

Chamar um veículo de imparcial é, por si só, um juízo político. Em vez de rótulo, este projeto usa **critérios explícitos** e **equilíbrio no nível da lista**: ela reúne veículos de linhas editoriais diferentes de propósito, e a skill cruza pelo menos três deles antes de chamar algo de fato convergente.

## Critérios

Para entrar, o veículo precisa cumprir todos:

1. **Cobertura factual de eleições**, com reportagem própria ou de agência, não só opinião.
2. **Política de correção pública**, ou seja, ele corrige erros de forma visível.
3. **Separação identificável entre notícia e opinião**, com colunas e editoriais marcados.
4. **Alcance nacional**, ou especialização reconhecida em checagem.

Para checagem, além disso: signatário do IFCN (International Fact-Checking Network) ou membro do Projeto Comprova.

Ficam de fora: veículos cuja linha é declaradamente militante (de qualquer lado), perfis em redes sociais, blogs pessoais e agregadores sem reportagem própria.

## A lista

### Oficial
| Fonte | Domínio | Nota |
|---|---|---|
| TSE: notícias | `tse.jus.br` | fonte primária institucional; costuma bloquear robôs (403) |
| Fato ou Boato (Justiça Eleitoral) | `justicaeleitoral.jus.br` | desmentidos oficiais; costuma bloquear robôs (403) |
| Agência Brasil | `agenciabrasil.ebc.com.br` | **estatal** (EBC); citar sempre com essa marcação |

### Imprensa nacional
| Fonte | Domínio |
|---|---|
| Folha de S.Paulo | `folha.uol.com.br` |
| O Estado de S. Paulo | `estadao.com.br` ⛔ |
| O Globo | `oglobo.globo.com` |
| g1 | `g1.globo.com` |
| Valor Econômico | `valor.globo.com` |
| UOL Notícias | `noticias.uol.com.br` |
| CNN Brasil | `cnnbrasil.com.br` |
| Poder360 | `poder360.com.br` |
| Gazeta do Povo | `gazetadopovo.com.br` |
| BBC News Brasil | `bbc.com` (seção `/portuguese`) ⛔ |

### Checagem
| Fonte | Domínio |
|---|---|
| Projeto Comprova (consórcio de veículos) | `projetocomprova.com.br` |
| Agência Lupa | `agencialupa.org` |
| Aos Fatos | `aosfatos.org` |
| AFP Checamos | `checamos.afp.com` (costuma bloquear robôs) |
| Estadão Verifica | `estadao.com.br` (seção `/estadao-verifica`) ⛔ |
| Fato ou Fake (g1) | `g1.globo.com` (seção `/fato-ou-fake`) |

⛔ **Bloqueia o crawler do Claude** (verificado em 2026-10-04): incluir o domínio em `allowed_domains` faz a busca inteira falhar. Esses veículos continuam na curadoria, mas ficam fora da busca automática. Entram só quando o usuário colar o link de uma matéria, e mesmo assim a leitura pode falhar.

Vários veículos têm paywall. Quando a matéria não abre, a skill usa o que estiver visível (título, linha fina, lead) e marca como "leitura parcial".
