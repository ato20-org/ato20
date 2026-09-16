"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  FileArchive,
  FolderOpen,
  FolderPlus,
  Hourglass,
  Loader2,
  MonitorOff,
  Smartphone,
  Tv,
  X,
} from "lucide-react";

import { toast } from "sonner";

import logo from "@/assets/logo-white.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAtualizacao } from "@/hooks/use-atualizacao";
import { useCaminhoCurto } from "@/hooks/use-caminho-curto";
import { useEstante } from "@/hooks/use-estante";
import { Livro3D } from "@/components/mestre/livro-3d";
import { abrirLivroNoSistema } from "@/lib/vault/estante";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import { dataCurta, desde, duracao } from "@/lib/tempo";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

import type { RecentEntry } from "@/lib/vault/campaign";
import { NovidadesLaterais } from "@/components/desktop/versoes-lista";

/**
 * Porta do Mestre: qual pasta abrir.
 *
 * Substitui as duas etapas de antes — conta de e-mail, depois escolha de mesa
 * — por uma só, e a razão é que o aplicativo de desktop **é** o mestre. Não
 * há a quem provar identidade: quem abriu o programa já está na máquina onde
 * as campanhas moram, e uma senha ali só protegeria o disco de si mesmo.
 *
 * O que sobrou é o modelo do Obsidian: uma pasta é uma campanha, e a porta
 * mostra as últimas abertas mais o seletor nativo.
 */
export function MestreGate() {
  const status = useCampaignStore((state) => state.status);

  // Na porta, e não com a mesa aberta: instalar uma atualização reinicia o
  // aplicativo, e este é o único momento do uso em que isso não custa nada.
  useAtualizacao();

  if (status === "sem-aplicativo") return <NoApp />;

  return <CampaignDoor />;
}

/**
 * Aberto numa aba de navegador em vez do aplicativo.
 *
 * Acontece de verdade: `pnpm dev` serve as três telas em `localhost:3000`, e o
 * Mestre é a única que precisa alcançar o disco. Dizer isso é melhor que uma
 * tela de erro genérica sobre um comando que falhou.
 */
function NoApp() {
  return (
    <Centered>
      <MonitorOff className="text-muted-foreground size-8" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">
        Abra pelo aplicativo
      </h1>
      <p className="text-muted-foreground text-sm">
        O Mestre lê e grava a campanha numa pasta do computador, e uma aba do
        navegador não alcança o disco. Quem baixou o aplicativo é o mestre; ele
        abre direto nesta tela.
      </p>

      {/* Para as duas telas que FUNCIONAM aqui: quem caiu neste endereço pelo
          navegador é quase sempre alguém da mesa que digitou o IP. Os dois
          links, e não um só para a raiz: a raiz É esta tela desde que o
          aplicativo virou desktop, então mandar para lá seria mandar para
          aqui. */}
      <div className="flex gap-2">
        <Button
          render={<Link href="/espectador" />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          <Tv aria-hidden />
          A TV da mesa
        </Button>
        <Button
          render={<Link href="/jogador" />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          <Smartphone aria-hidden />
          O teu celular
        </Button>
      </div>
    </Centered>
  );
}

function CampaignDoor() {
  const recents = useCampaignStore((state) => state.recents);
  const busy = useCampaignStore((state) => state.busy);
  const error = useCampaignStore((state) => state.error);
  const choose = useCampaignStore((state) => state.choose);
  const openFolder = useCampaignStore((state) => state.openFolder);
  const forget = useCampaignStore((state) => state.forget);
  const importar = useCampaignStore((state) => state.importar);

  const [creating, setCreating] = useState(false);

  if (creating) return <CreateForm onCancel={() => setCreating(false)} />;

  // O Rust já devolve a lista da mais recente para a mais antiga -- `order by
  // aberta_em desc`. A primeira ganha lugar próprio porque, na esmagadora
  // maioria das aberturas, ela É a resposta: o mestre está voltando para a
  // campanha em que estava.
  const [ultima, ...outras] = recents;

  return (
    <Porta lateral={<NovidadesLaterais />}>
      <header className="flex flex-col items-center gap-3 text-center">
        {/* A logo com o NOME ao lado, e não um ícone de pasta.
            Esta é a primeira tela do aplicativo -- antes dela não há nada --,
            e um ícone genérico fazia a abertura parecer um seletor de arquivo
            de sistema. O desenho sozinho tampouco resolve: ele é um d20 dentro
            de uma tenda, e quem abre pela primeira vez não tem como saber que
            aquilo se chama ATO20. */}
        <div className="flex items-center gap-3">
          <Image
            src={logo}
            alt=""
            aria-hidden
            priority
            className="h-10 w-auto"
          />
          <span className="text-xl font-semibold tracking-[0.2em]">ATO20</span>
        </div>

        {/* Um título só, com ou sem campanha na lista. Eram dois -- "Sua IDE
            para gerenciar mesas de RPG" na primeira abertura, "Bem-vindo ao
            ATO20" depois --, e com eles mudavam o subtítulo, os três cartões
            de apresentação e o peso dos botões. Lado a lado as duas pareciam
            telas diferentes do mesmo aplicativo, e a porta é UMA. */}
        <h1 className="text-2xl font-semibold tracking-tight">
          Bem-vindo ao ATO20
        </h1>
      </header>

      {ultima ? (
        <Secao titulo="Continuar">
          <CampanhaLinha
            entry={ultima}
            destaque
            busy={busy}
            onOpen={choose}
            onForget={forget}
          />
        </Secao>
      ) : null}

      {outras.length > 0 ? (
        <Secao titulo="Outras campanhas">
          {outras.map((entry) => (
            <CampanhaLinha
              key={entry.path}
              entry={entry}
              busy={busy}
              onOpen={choose}
              onForget={forget}
            />
          ))}
        </Secao>
      ) : null}

      <Estante />

      {/* As três em linha, e não empilhadas ocupando a largura: com a lista
          acima elas são saída secundária, e três botões de largura cheia
          competiam com as campanhas pelo mesmo peso visual.

          O mesmo peso nas três, com lista ou sem ela. Antes "Criar campanha"
          virava botão cheio na primeira abertura, e era metade do que fazia a
          porta vazia parecer outra tela. */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void openFolder()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <FolderOpen />}
          Abrir uma pasta
        </Button>

        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => setCreating(true)}
        >
          <FolderPlus />
          Criar campanha
        </Button>

        {/* Importar mora aqui, e não atrás da campanha aberta: quem recebeu um
            zip de outro mestre ainda não tem campanha nenhuma, e a porta é a
            primeira tela que ele vê. */}
        <Button variant="ghost" disabled={busy} onClick={() => void importar()}>
          <FileArchive />
          Importar de um zip
        </Button>
      </div>

      {error ? (
        <p className="text-destructive text-center text-sm">{error}</p>
      ) : null}
    </Porta>
  );
}

/**
 * Os livros de regras desta máquina, na porta.
 *
 * Aqui e não dentro da campanha porque a estante não é de campanha nenhuma: o
 * manual de um SISTEMA serve todas as mesas dele, e é isso que o `useEstante`
 * já diz no próprio comentário -- "o mestre consulta uma regra antes de
 * escolher a campanha da noite".
 *
 * Mostra, e não abre. O leitor é uma janela do dock do Mestre, e o dock só
 * existe com campanha aberta -- abrir um livro daqui seria montar o leitor fora
 * da mesa, que é outra feature. O que esta faixa faz é lembrar que os livros
 * estão lá, e em que página cada um parou.
 *
 * Some quando está vazia, em vez de convidar a importar: a porta já tem três
 * ações, e uma quarta competindo por atenção na primeira abertura é ruído.
 */
function Estante() {
  const { livros } = useEstante();

  if (livros.length === 0) return null;

  return (
    <section className="space-y-1.5">
      <h2 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
        Na estante
      </h2>

      {/* Prateleira, e não lista: com capa, cada livro é uma caixa em pé, e
          caixas ficam lado a lado. Rola na horizontal quando não cabem, em vez
          de empurrar a lista de campanhas para baixo. Abre no programa de PDF
          da máquina -- ver `abrirLivroNoSistema`. */}
      <ul className="-mx-2 flex gap-1 overflow-x-auto px-2 pt-2 pb-1">
        {livros.map((livro) => (
          <li key={livro.id} className="shrink-0">
            <Livro3D
              livro={livro}
              onAbrir={() => {
                void abrirLivroNoSistema(livro.id).catch((cause: unknown) =>
                  toast.error(
                    cause instanceof Error
                      ? cause.message
                      : "Não foi possível abrir o livro.",
                  ),
                );
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Secao({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h2 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
        {titulo}
      </h2>
      <ul className="space-y-1">{children}</ul>
    </section>
  );
}

/**
 * Uma campanha da lista.
 *
 * O botão tem altura AUTOMÁTICA, e isso é conserto e não estilo: as duas linhas
 * -- nome e caminho -- moravam dentro de um botão de 32px de altura fixa, e o
 * caminho saía cortado pela borda de baixo em toda linha da lista.
 *
 * O caminho aparece porque o nome da campanha frequentemente se repete entre
 * cópias -- a de teste, a que veio no zip --, e ele é a única coisa que
 * desempata as duas.
 *
 * Os NÚMEROS só na destacada. Quando ela foi aberta, quando nasceu e quanto
 * tempo já somou não ajudam a escolher entre doze linhas -- ali o que se
 * procura é um nome. Na campanha que se vai reabrir eles são outra coisa: são o
 * retrato de onde a mesa está.
 */
function CampanhaLinha({
  entry,
  destaque = false,
  busy,
  onOpen,
  onForget,
}: {
  entry: RecentEntry;
  /** A última aberta, que ganha mais corpo por ser a resposta provável. */
  destaque?: boolean;
  busy: boolean;
  onOpen: (path: string) => Promise<void> | void;
  onForget: (path: string) => Promise<void> | void;
}) {
  const encurtar = useCaminhoCurto();

  return (
    <li className="group flex items-center gap-1">
      <Button
        variant="outline"
        className={cn(
          // `h-auto` porque o tamanho do botão crava `h-8`, e `min-w-0` porque
          // `truncate` só corta dentro de largura definida -- sem ele um
          // caminho longo estica a porta inteira.
          "h-auto min-w-0 flex-1 flex-col items-start gap-0.5 px-3 text-left",
          destaque ? "py-3" : "py-2",
        )}
        // Pasta que não está no disco continua na lista de propósito: o volume
        // externo pode estar desconectado, e esconder a linha fecharia o
        // caminho de volta quando ele voltasse.
        disabled={busy || !entry.existe}
        onClick={() => void onOpen(entry.path)}
      >
        <span
          className={cn("w-full truncate", destaque ? "text-base" : "text-sm")}
        >
          {entry.nome}
        </span>
        <span className="text-muted-foreground w-full truncate text-xs font-normal">
          {entry.existe
            ? encurtar(entry.path)
            : `${encurtar(entry.path)} — não encontrada`}
        </span>

        {destaque && entry.existe ? (
          <span className="mt-3 grid w-full grid-cols-3 gap-3 border-t border-border/60 pt-3">
            <Numero
              icone={Clock}
              rotulo="Última sessão"
              valor={desde(entry.abertaEm)}
            />

            {/* A data de nascimento some quando a pasta não está alcançável --
                ela mora no `config.json`, que é justamente o que não se
                conseguiu ler. Aqui nunca acontece, porque o bloco inteiro só
                existe com `existe`, mas o tipo diz que pode e a tela obedece ao
                tipo. */}
            <Numero
              icone={CalendarDays}
              rotulo="Criada em"
              valor={entry.criadaEm ? dataCurta(entry.criadaEm) : "—"}
              nota={entry.criadaEm ? desde(entry.criadaEm) : undefined}
            />

            {/* Zero vira travessão, e não "menos de 1 min": campanha que nunca
                esteve aberta desde que o relógio existe não tem tempo nenhum a
                mostrar, e inventar um faria toda campanha antiga parecer
                recém-nascida. */}
            <Numero
              icone={Hourglass}
              rotulo="Tempo aberta"
              valor={entry.tempoMs > 0 ? duracao(entry.tempoMs) : "—"}
            />
          </span>
        ) : null}
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Tirar ${entry.nome} da lista`}
        className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={() => void onForget(entry.path)}
      >
        <X />
      </Button>
    </li>
  );
}

/**
 * Um número da campanha destacada.
 *
 * Rótulo em cima e valor embaixo, como a ficha de um jogo na Steam: a pergunta
 * vem antes da resposta, e aí três números lado a lado se leem sem legenda
 * nenhuma. A linha corrida que havia antes -- "aberta agora há pouco · criada
 * há 6 dias · 2 min aberta no total" -- obrigava a ler a frase inteira para
 * achar um dos três.
 *
 * `nota` é o segundo jeito de dizer a mesma coisa, menor e apagado. Serve à
 * data: o valor é a data em si, que é o que se guarda, e "há 6 dias" ao lado
 * poupa a conta quando a pergunta era só se foi recente.
 *
 * Tudo em `span`, e não `div`: isto vive dentro de um `<button>`, e ali
 * conteúdo de bloco é HTML inválido -- o browser fecha o botão antes da `div` e
 * metade do cartão deixa de ser clicável.
 */
function Numero({
  icone: Icone,
  rotulo,
  valor,
  nota,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: string;
  nota?: string;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-muted-foreground flex items-center gap-1.5 text-[0.65rem] tracking-wide uppercase">
        <Icone className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{rotulo}</span>
      </span>
      <span className="truncate text-xs font-medium">{valor}</span>
      {nota ? (
        <span className="text-muted-foreground/70 truncate text-[0.65rem]">
          {nota}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A moldura da porta.
 *
 * Mais larga que a do `Centered`, e o conteúdo alinhado à esquerda em vez de
 * centrado: aqui o que está na tela é uma LISTA, e lista centrada obriga o olho
 * a procurar onde cada linha começa. O cabeçalho continua centrado, porque ele
 * é apresentação e não escolha.
 */
/**
 * O corpo da porta: a coluna do mestre e, encostado na borda, o painel lateral.
 *
 * Em duas colunas a rolagem é de CADA UMA, e o `lg:overflow-hidden` aqui é o que
 * garante isso: sem ele as duas rolariam juntas na página, e o painel deixaria
 * de ser painel -- descer para ler uma versão antiga levaria a lista de
 * campanhas embora.
 *
 * Empilhado, o contrário: a rolagem volta a ser da página. Com o corte aqui e a
 * área de rolagem lá dentro, o painel que vem depois da coluna ficaria fora do
 * quadro e sem como ser alcançado -- a altura que ele precisaria para rolar por
 * dentro só existe quando ele é uma COLUNA ao lado, esticada pela linha.
 *
 * O painel traz a própria largura, a própria divisa e o próprio `aside`; aqui
 * ele é só o segundo filho da linha. É o que permite não desenhar nada quando
 * não há o que mostrar, em vez de deixar uma coluna vazia ocupando espaço.
 *
 * Linha só a partir de `lg`. Abaixo disso o painel empilha embaixo: a janela do
 * aplicativo tem `minWidth: 1024` e nunca chega lá, mas as mesmas telas abrem no
 * navegador em `pnpm dev`, e 20rem espremidas ao lado da lista de campanhas não
 * servem a ninguém.
 */
function Porta({
  children,
  lateral,
}: {
  children: React.ReactNode;
  lateral?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      {/* `my-auto` no filho em vez de `items-center` no pai, e rolagem no pai:
          a lista guarda doze campanhas, e numa janela baixa a coluna passa da
          tela. Centralizar por `items-center` com estouro corta o topo -- o
          conteúdo sobe acima do início da área rolável e vira inalcançável.
          Assim ela centraliza quando cabe e rola quando não cabe. */}
      <div className="flex flex-1 justify-center p-6 lg:min-h-0 lg:overflow-y-auto">
        <div className="my-auto flex w-full max-w-xl flex-col gap-6">
          {children}
        </div>
      </div>

      {lateral}
    </div>
  );
}

/**
 * Nome antes da pasta-mãe.
 *
 * Nesta ordem porque o nome é o que decide o nome da pasta: pedir a pasta
 * primeiro e o nome depois deixaria o mestre escolhendo onde criar algo que
 * ele ainda não nomeou.
 */
function CreateForm({ onCancel }: { onCancel: () => void }) {
  const busy = useCampaignStore((state) => state.busy);
  const error = useCampaignStore((state) => state.error);
  const create = useCampaignStore((state) => state.create);

  const [nome, setNome] = useState("");

  return (
    <Centered>
      <FolderPlus className="text-muted-foreground size-8" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">Nova campanha</h1>
      <p className="text-muted-foreground text-sm">
        Crie uma nova campanha no ATO20
      </p>

      <form
        className="w-full space-y-3 text-left"
        onSubmit={(event) => {
          event.preventDefault();
          void create(nome);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="campaign-name">Nome da campanha</Label>
          <Input
            id="campaign-name"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="A Marca do Javali"
          />
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <Button
          type="submit"
          className="w-full"
          disabled={nome.trim().length === 0 || busy}
        >
          {busy ? <Loader2 className="animate-spin" /> : null}
          Escolher a pasta
        </Button>
      </form>

      <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
        Voltar
      </Button>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        {children}
      </div>
    </div>
  );
}
