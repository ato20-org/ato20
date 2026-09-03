# ATO20

Ferramenta para organizar e exibir cenas de RPG de mesa.

Feita para jogo presencial: o mestre monta a próxima cena no notebook enquanto a mesa
continua vendo a atual na TV, e cada jogador acompanha pelo próprio celular.

**Projeto pessoal.** Repositório privado, instância fechada por chave de acesso.

## Três telas

| Tela | Rota | O que é |
| --- | --- | --- |
| Operador | `/operador` | A tela do mestre: monta cenas, arrasta imagens, esconde regiões, decide o que entra no ar |
| Assistir | `/assistir` | Só o palco, sem controle. Vai na TV atrás do mestre |
| Plateia | `/plateia` | O celular de cada jogador: vê a cena, guarda anexos do personagem, consulta regras |

A cena **em edição** e a cena **no ar** são separadas — é isso que permite preparar a
próxima enquanto a mesa segue na atual.

## Rodar local

Requer Node 20+ e pnpm.

```bash
pnpm install
pnpm dev
```

Abre em `http://localhost:3000`. Sem nenhuma configuração adicional, **Operador e
Assistir já funcionam**: as duas abas conversam por `BroadcastChannel`, e cenas, imagens
e sons ficam no IndexedDB do próprio navegador. Nada sai da máquina.

O que exige configuração é só a Plateia, porque o celular do jogador é outro aparelho.

## Plateia: Supabase

Copie o exemplo e preencha:

```bash
cp .env.example .env.local
```

| Variável | Para quê |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Endereço do projeto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública (`publishable` ou `anon`) |
| `ATO20_ACCESS_TOKEN` | Chave de acesso da instância — ver abaixo |

No painel do Supabase:

1. **Authentication → Sign In / Providers → Anonymous Sign-Ins**: habilite. O jogador
   entra sem cadastro, e é o `auth.uid()` anônimo que a RLS usa para isolar os dados.
2. **SQL Editor**: execute os arquivos de `supabase/migrations/` em ordem. Eles criam as
   tabelas, as policies, os RPC e os dois buckets de Storage. São idempotentes.

O mestre abre o Operador, que gera um código de 6 caracteres. O jogador entra por
`/plateia?code=XXXXXX` ou pelo link de convite.

### Os dois buckets

`assets` é **público**: todo espectador busca o mesmo mapa a cada troca de cena, e URL
pública permite cache do navegador e da CDN.

`attachments` é **privado**: é a ficha do jogador. Sai por URL assinada de curta duração,
e a RLS garante que só o dono e o mestre a alcancem.

## Chave de acesso

A ferramenta é fechada por um segredo único, verificado no `middleware` — ou seja, **no
servidor**, antes de a página ser entregue.

```bash
openssl rand -base64 32
```

Ponha o resultado em `ATO20_ACCESS_TOKEN`. Note que **não tem prefixo `NEXT_PUBLIC_`**:
com o prefixo, o Next embutiria a variável no JavaScript do cliente e ela deixaria de ser
segredo.

Para liberar um aparelho, abra `/api/entrar?k=SUA_CHAVE` ou cole a chave em `/entrar`.
Grava um cookie `httpOnly` de um ano. `POST /api/sair` remove.

**Comportamento sem a variável:** em produção, tudo que não seja a landing é bloqueado.
Falhar fechando é proposital — esquecer de configurar não pode deixar a ferramenta aberta
sem ninguém perceber. Em desenvolvimento, libera.

### O que este portão não é

Um segredo compartilhado, não contas de usuário: quem tem a chave tem acesso de mestre.
Não há permissão por pessoa nem como revogar um aparelho sem revogar todos.

E a chave pública do Supabase continua embutida no bundle — por design. Ela não é
segredo; é a RLS que protege os dados. Mas quem a obtiver pode criar salas próprias no seu
projeto, gastando sua cota. Se isso importar, restrinja o `insert` em `rooms`.

## Deploy no Vercel

Importe o repositório e configure as três variáveis. A landing (`/`) fica pública; o resto
exige a chave.

O plano gratuito do Supabase aperta primeiro no **Storage** — mapas em PNG comem 1 GB
rápido. Egress e realtime sobram para jogo semanal.

## Como está construído

Next.js (App Router), TypeScript, Tailwind, shadcn/ui, zustand, IndexedDB via `idb`.

Duas decisões que explicam o resto do código:

**Plano de cena fixo de 1920×1080.** Toda posição vive nessas coordenadas, e cada tela
escala o plano para caber nela. Sem isso, o que o mestre posiciona não bate com o que
aparece na TV.

**Transporte atrás de uma interface de três métodos** (`src/lib/sync/`). O Operador
publica em `BroadcastChannel` e no Supabase Realtime ao mesmo tempo, e nenhum componente
de desenho sabe qual está em uso. As mensagens de rede passam por um throttle de 10 Hz —
arrastar um item emite ~60 mudanças por segundo, e o plano gratuito conta mensagens por
mês.

A lógica pura fica isolada em `src/lib/geometry/` e `src/lib/operator/` justamente para
ser verificável sem navegador.

## Testes

O repositório **ainda não tem suíte automatizada**. Os módulos puros foram escritos para
serem testáveis de fora — é o motivo de `reorderByZ`, `clampViewport`, `flipPatches`,
`scaleGroup` e companhia existirem separados dos componentes — mas portá-los para um
runner ainda é trabalho pendente.

## Licença

Sem licença definida. Repositório privado, uso pessoal — todos os direitos reservados.
