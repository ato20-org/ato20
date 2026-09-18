"use client";

import { useEffect, useState } from "react";
import {
  Blocks,
  Box,
  Keyboard,
  Minus,
  History,
  Moon,
  Palette,
  Plus,
  Puzzle,
  Settings,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import { ChromeButton } from "@/components/desktop/window-chrome";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { HistoricoDeVersoes } from "@/components/desktop/versoes-lista";
import { versaoAtual } from "@/lib/versoes";
import { atalhosPorGrupo } from "@/lib/mestre/atalhos";
import { type Extensao, tipoDaExtensao } from "@/lib/extensoes/manifesto";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import {
  DEGRAUS_ZOOM,
  usePreferenciasStore,
} from "@/lib/store/use-preferencias-store";
import { cn } from "@/lib/utils";

/**
 * As seções, na ordem da barra lateral.
 *
 * Plugins por último de propósito: é a única que ainda não faz nada, e primeira
 * na lista ela seria a primeira impressão da tela.
 */
const SECOES = [
  { chave: "geral", titulo: "Geral", icone: SlidersHorizontal },
  { chave: "versao", titulo: "Versão", icone: History },
  { chave: "teclado", titulo: "Teclado", icone: Keyboard },
  { chave: "plugins", titulo: "Plugins", icone: Puzzle },
] as const;

type Chave = (typeof SECOES)[number]["chave"];

/**
 * As configurações da máquina.
 *
 * Em diálogo, e não como tela do dock: configuração não é ferramenta de sessão
 * — não se atraca ao lado do mapa nem se deixa aberta enquanto se joga. E o
 * gatilho vive na barra da janela, que existe ANTES da campanha: na porta e no
 * splash o dock não está montado, e uma tela dele ali seria um botão morto.
 *
 * Barra lateral e não abas no topo: as seções vão crescer — teclado, plugins, e
 * o que a mesa pedir —, e fileira de abas é a arrumação que estoura primeiro.
 * Trinta por cento dela, que é onde o nome mais longo caberia sem quebrar.
 *
 * Altura FIXA, e não do tamanho do conteúdo: Teclado tem trinta linhas e Tema
 * tem três, e um diálogo que muda de altura ao trocar de seção move o alvo do
 * clique embaixo do ponteiro.
 *
 * Só existe dentro do aplicativo, de graça: quem a desenha é o `WindowChrome`,
 * que já não se desenha no navegador.
 */
export function ConfiguracoesDialog() {
  const [secao, setSecao] = useState<Chave>("geral");

  return (
    // `modal="trap-focus"` e nao o modal cheio: com ele o base-ui desliga o
    // ponteiro em tudo que esta fora do dialogo, e fora dele mora a barra da
    // janela -- minimizar, maximizar e fechar ficavam mortos, e o proprio
    // gatilho congelava com o realce de passagem do mouse, parecendo ligado.
    // Assim o foco continua preso dentro do dialogo e a barra volta a atender.
    <Dialog modal="trap-focus">
      <DialogTrigger
        render={
          <ChromeButton
            label="Configurações"
            icon={<Settings className="size-3.5" />}
          />
        }
      />

      {/* O teto pelo `min` e não por `sm:max-w-3xl` sozinho: a partir de 640px
          a variante venceria o `max-w-[calc(100%-2rem)]` da base, e numa janela
          de 700px o diálogo encostaria nas duas beiradas. Assim a folga de
          1rem sobrevive em qualquer largura. */}
      {/* `top-8` no fundo: a barra da janela tem `h-8` e fica no fluxo, logo
          um fundo em `inset-0` a cobriria -- e o blur apagava os botoes de
          janela, que continuam clicaveis com o dialogo aberto. */}
      <DialogContent
        className="gap-0 p-0 sm:max-w-[min(48rem,calc(100%-2rem))]"
        overlayClassName="top-8"
      >
        <div className="flex h-[min(32rem,80vh)] min-h-0">
          {/* `min-w-36` embaixo dos 30%: num gerenciador de janelas de mosaico
              a janela do aplicativo fica estreita de verdade, e 30% de pouco é
              uma coluna onde "Área de transferência" não caberia. */}
          <nav className="bg-muted/30 flex w-[30%] min-w-36 shrink-0 flex-col gap-3 border-r p-2">
            <div className="px-1.5 pt-1">
              <DialogTitle>Configurações</DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                Configurações gerais do ATO20.
              </DialogDescription>
            </div>

            <ul className="flex flex-col gap-0.5">
              {SECOES.map(({ chave, titulo, icone: Icone }) => (
                <li key={chave}>
                  <Button
                    variant={secao === chave ? "secondary" : "ghost"}
                    size="sm"
                    // `aria-current` e não só a cor: quem navega por leitor de
                    // tela precisa saber qual seção está aberta, e "botão
                    // Teclado" não diz isso.
                    aria-current={secao === chave ? "page" : undefined}
                    className="w-full justify-start"
                    onClick={() => setSecao(chave)}
                  >
                    <Icone />
                    <span className="truncate">{titulo}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </nav>

          <ScrollArea className="min-w-0 flex-1">
            {/* `pr-10` por causa do X de fechar, que é absoluto no canto do
                diálogo e cairia sobre o título da seção. */}
            <div className="flex flex-col gap-4 p-4 pr-10">
              {secao === "geral" ? <PainelGeral /> : null}
              {secao === "versao" ? <PainelVersao /> : null}
              {secao === "teclado" ? <PainelTeclado /> : null}
              {secao === "plugins" ? <PainelPlugins /> : null}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** O título de uma seção, no alto do painel da direita. */
function TituloSecao({
  children,
  ajuda,
}: {
  children: React.ReactNode;
  ajuda?: string;
}) {
  return (
    <div>
      <h2 className="font-heading text-sm font-medium">{children}</h2>
      {ajuda ? <p className="text-muted-foreground text-xs">{ajuda}</p> : null}
    </div>
  );
}

function PainelGeral() {
  return (
    <>
      <TituloSecao>Geral</TituloSecao>
      <SecaoZoom />
      <Separator />
      <SecaoTema />
    </>
  );
}

/**
 * O tamanho da interface.
 *
 * Diz "a janela inteira, o palco incluído" porque essa é a pergunta que o
 * mestre faz olhando o controle: o palco tem zoom próprio no Ctrl+0 e no
 * Ctrl+=, e sem a frase os dois pareceriam o mesmo botão em dois lugares.
 */
function SecaoZoom() {
  const zoom = usePreferenciasStore((state) => state.zoom);
  const definirZoom = usePreferenciasStore((state) => state.definirZoom);

  const indice = DEGRAUS_ZOOM.indexOf(zoom);

  return (
    <section className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">Zoom da interface</p>
        <p className="text-muted-foreground text-xs">
          Escala a janela inteira, o palco incluído. A câmera sobre o mapa
          continua no zoom dela.
        </p>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Diminuir o zoom da interface"
          disabled={indice <= 0}
          onClick={() => definirZoom(DEGRAUS_ZOOM[indice - 1])}
        >
          <Minus />
        </Button>

        {/* `tabular-nums` para o número não empurrar os botões ao trocar de
            largura -- 90% e 125% têm contagens de dígitos diferentes. */}
        <span className="w-14 text-center text-sm tabular-nums">
          {Math.round(zoom * 100)}%
        </span>

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Aumentar o zoom da interface"
          disabled={indice >= DEGRAUS_ZOOM.length - 1}
          onClick={() => definirZoom(DEGRAUS_ZOOM[indice + 1])}
        >
          <Plus />
        </Button>
      </div>
    </section>
  );
}

/**
 * O tema, que hoje é um só.
 *
 * A seção existe mostrando a escolha travada em vez de esconder o assunto: o
 * escuro não é um acidente de quem nunca implementou o claro, é uma decisão com
 * motivo — e o lugar de dizer isso é onde o mestre vem procurar o botão. Ver o
 * `layout.tsx`, que é quem trava.
 */
function SecaoTema() {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">Tema</p>
        <p className="text-muted-foreground text-xs">
          Só o escuro, por ora: a ferramenta roda em mesa com luz baixa e
          projetada em TV, onde fundo claro ofusca.
        </p>
      </div>

      <div className="bg-muted/40 flex items-center gap-2 rounded-lg border px-2.5 py-2">
        <Moon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        <span className="text-sm">Escuro</span>
        <span className="text-muted-foreground ml-auto text-xs">padrão</span>
      </div>
    </section>
  );
}

/**
 * Os atalhos que existem, agrupados por assunto.
 *
 * Só leitura, e é o ganho maior pelo custo menor: até aqui nenhum atalho
 * aparecia em lugar nenhum da interface, e o que não se descobre não existe.
 * Remapear é outra conversa -- pede onde gravar a escolha, e teclado remapeado
 * seria o primeiro dado que não pertence nem à cena nem à sessão nem à
 * arrumação da bancada.
 *
 * A lista sai da MESMA tabela que o listener consulta, e não de uma cópia
 * escrita à mão: ver a nota em `ATALHOS`.
 */
/**
 * Qual versão está rodando, se ela avisa quando sai outra, e o que mudou até
 * aqui.
 *
 * Os três no mesmo lugar porque são a mesma pergunta em três tempos: o que eu
 * tenho, o que eu faço quando sair algo novo, e o que já mudou. Separar o
 * histórico numa seção própria faria procurar duas vezes.
 */
function PainelVersao() {
  const versao = versaoAtual();
  const avisar = usePreferenciasStore((state) => state.avisarAtualizacao);
  const definirAvisar = usePreferenciasStore(
    (state) => state.definirAvisarAtualizacao,
  );

  return (
    <>
      <TituloSecao ajuda="Histórico de versões do ATO20">
        Versão {versao?.versao ?? ""}
      </TituloSecao>

      <label className="flex items-start gap-3">
        <Switch
          checked={avisar}
          onCheckedChange={definirAvisar}
          aria-label="Avisar quando sair versão nova"
        />
        <span className="min-w-0">
          <span className="block text-sm">Avisar quando sair versão nova</span>
          {/* Diz o que o desligado GARANTE, e não só o que ele evita: quem
              desliga isto quer ficar na versão que tem, e a frase é o que
              confirma que ficar é uma opção sustentada. */}
          <span className="text-muted-foreground block text-xs">
            Desligado, o aplicativo não procura atualização nenhuma e você fica
            nesta versão até baixar outra por conta própria.
          </span>
        </span>
      </label>

      <Separator />

      <TituloSecao>Histórico</TituloSecao>
      <HistoricoDeVersoes />
    </>
  );
}

function PainelTeclado() {
  // A lista passou a depender dos plugins habilitados, e `atalhosPorGrupo` lê o
  // store por fora do React. Sem esta assinatura, ligar uma extensão com a tela
  // aberta não acrescentaria os atalhos dela aqui.
  useExtensoesStore((state) => state.extensoes);

  const grupos = atalhosPorGrupo();

  return (
    <>
      <TituloSecao ajuda="Lista dos atalhos existentes no sistema.">
        Teclado
      </TituloSecao>

      <div className="flex flex-col gap-4">
        {grupos.map(({ grupo, atalhos }) => (
          <section key={grupo} className="flex flex-col gap-1">
            <p className="text-muted-foreground text-[10px] font-medium uppercase">
              {grupo}
            </p>

            <ul className="flex flex-col">
              {atalhos.map((atalho) => (
                <li
                  key={`${atalho.tecla}-${atalho.rotulo}`}
                  className="flex items-center justify-between gap-3 border-b py-1.5 last:border-b-0"
                >
                  <span className="min-w-0 text-sm">{atalho.rotulo}</span>
                  <Tecla>{atalho.tecla}</Tecla>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/** Uma combinação de teclas, como ela se escreve. */
function Tecla({ children }: { children: string }) {
  return (
    <kbd
      className={cn(
        "bg-muted text-muted-foreground shrink-0 rounded border px-1.5 py-0.5",
        // `font-mono` e não a fonte do texto: a lista se lê em varredura
        // vertical, e largura fixa alinha os modificadores.
        "font-mono text-[11px] leading-none",
      )}
    >
      {children}
    </kbd>
  );
}

/**
 * As extensões desta máquina: o que está instalado, e o que está ligado.
 *
 * A seção continua se chamando "Plugins" na barra lateral porque é a palavra
 * que quem procura isto tem na cabeça, e o código diz "extensão" porque é o
 * que o Rust e o `manifest.json` dizem. Vale a divergência: renomear a barra
 * lateral custaria o termo que o usuário reconhece, e renomear o código
 * custaria o termo que o autor de extensão vai ler na documentação.
 *
 * A lista é lida ao ABRIR a seção, e não uma vez na montagem do diálogo:
 * instalar uma extensão é copiar uma pasta, e quem faz isso por fora do
 * aplicativo espera achá-la aqui sem reabrir a janela.
 */
function PainelPlugins() {
  const extensoes = useExtensoesStore((state) => state.extensoes);
  const carregada = useExtensoesStore((state) => state.carregada);
  const ocupada = useExtensoesStore((state) => state.ocupada);
  const erro = useExtensoesStore((state) => state.erro);
  const carregar = useExtensoesStore((state) => state.carregar);
  const importar = useExtensoesStore((state) => state.importar);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <>
      <TituloSecao ajuda="Plugins customizados para personalizar o sistema, e melhorar a experiência.">
        Plugins
      </TituloSecao>

      <Button
        variant="outline"
        size="sm"
        disabled={ocupada}
        className="w-full"
        onClick={() => void importar()}
      >
        <Puzzle />
        Importar plugin
      </Button>

      {erro ? (
        <p className="text-destructive text-xs" role="alert">
          {erro}
        </p>
      ) : null}

      {/* Enquanto a primeira leitura não voltou, nada: uma lista vazia que
          vira lista cheia um quadro depois diz "você não tem nenhum" para
          quem tem. */}
      {!carregada ? null : extensoes.length === 0 ? (
        /* Centrado e com ícone, e não uma linha de texto encostada na margem.
           Vazia, esta seção era um painel inteiro em branco com cinco palavras
           no canto de cima -- lia como se a lista tivesse falhado ao carregar.
           Sem moldura: aqui não se solta arquivo nenhum, e o tracejado é o
           desenho de quem recebe arrasto -- prometeria um gesto que a seção
           não tem. */
        <div className="text-muted-foreground flex flex-col items-center gap-1.5 px-4 py-10 text-center">
          <Box className="size-5 shrink-0" aria-hidden />
          <p className="text-foreground text-sm">Nenhum plugin instalado</p>
          <p className="text-muted-foreground/70 text-xs">
            Um plugin é uma pasta com <code>manifest.json</code> dentro.
            Importar é copiá-la para cá.
          </p>
        </div>
      ) : (
        <Grupos extensoes={extensoes} />
      )}
    </>
  );
}

/**
 * Os plugins, separados por natureza.
 *
 * A separação é a coisa mais importante desta tela, e não arrumação: um TEMA é
 * CSS que a cascata aplica, e o pior que ele faz é deixar a interface feia —
 * dá para desligar olhando. Uma FUNCIONALIDADE é código que roda com o alcance
 * da janela, e instalar uma é confiar em quem a escreveu.
 *
 * Duas listas sob dois cabeçalhos, e não uma lista com etiqueta na ponta
 * direita de cada linha: a etiqueta é lida DEPOIS do nome, e é o nome que a
 * pessoa já decidiu instalar. O cabeçalho vem antes, e é o que faz a segunda
 * decisão não se disfarçar da primeira.
 *
 * Grupo vazio não aparece. Quem só tem temas não precisa ver uma seção de
 * funcionalidades para saber que não tem nenhuma.
 */
function Grupos({ extensoes }: { extensoes: Extensao[] }) {
  const temas = extensoes.filter(
    (extensao) => tipoDaExtensao(extensao) === "tema",
  );
  const funcionalidades = extensoes.filter(
    (extensao) => tipoDaExtensao(extensao) === "funcionalidade",
  );

  return (
    <div className="flex flex-col gap-4">
      <Grupo
        titulo="Temas"
        icone={Palette}
        extensoes={temas}
        nota="Só aparência: cores, cantos e fonte da interface."
      />

      <Grupo
        titulo="Funcionalidades"
        icone={Blocks}
        extensoes={funcionalidades}
        // A ressalva do código não carregado desceu para a LINHA, e não vale
        // para o grupo inteiro: um plugin declarativo -- fontes de retrato, por
        // exemplo -- é funcionalidade e já funciona. A nota aqui diria que ele
        // não roda, o que seria falso.
        nota="Estendem o que o ATO20 faz. Podem executar código com o alcance da janela."
      />
    </div>
  );
}

/** Um grupo da lista. Nada, quando não há extensão dele. */
function Grupo({
  titulo,
  icone: Icone,
  extensoes,
  nota,
}: {
  titulo: string;
  icone: typeof Palette;
  extensoes: Extensao[];
  nota: string;
}) {
  if (extensoes.length === 0) return null;

  return (
    <section className="flex flex-col gap-1">
      {/* A mesma forma dos grupos de Teclado, que já resolvem este problema
          na seção ao lado: maiúscula miúda, e a lista encostada embaixo. */}
      <p className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-medium uppercase">
        <Icone className="size-3" aria-hidden />
        {titulo}
      </p>

      <p className="text-muted-foreground mb-1 text-xs">{nota}</p>

      <ul className="flex flex-col">
        {extensoes.map((extensao) => (
          <LinhaExtensao key={extensao.id} extensao={extensao} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Uma extensão na lista.
 *
 * O interruptor é o alvo grande e a lixeira é o alvo pequeno, e é de propósito:
 * desligar é o gesto reversível e frequente — experimentar um tema e voltar —,
 * e desinstalar apaga a pasta do disco. O tamanho do botão é o que separa os
 * dois debaixo do mesmo dedo.
 */
function LinhaExtensao({ extensao }: { extensao: Extensao }) {
  const habilitar = useExtensoesStore((state) => state.habilitar);
  const remover = useExtensoesStore((state) => state.remover);

  // A etiqueta só para a HÍBRIDA: uma extensão de código que também traz CSS.
  // Nos outros casos o cabeçalho do grupo já disse o que ela é, e repetir na
  // ponta de cada linha seria ruído em toda lista para cobrir um caso raro.
  const tambemTema =
    extensao.tema && tipoDaExtensao(extensao) === "funcionalidade";

  return (
    <li className="flex items-center gap-3 border-b py-2 last:border-b-0">
      <Switch
        checked={extensao.habilitada}
        onCheckedChange={(ligada) => void habilitar(extensao.id, ligada)}
        aria-label={`Habilitar ${extensao.nome}`}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{extensao.nome}</p>
        <p className="text-muted-foreground truncate text-xs">
          {/* A versão sempre, o autor quando há. O `manifest.json` pode vir
              sem autor, e "por undefined" seria pior que só a versão. */}
          {extensao.versao}
          {extensao.autor ? ` · ${extensao.autor}` : ""}
        </p>

        {/* Só para quem declara `principal`. O plugin aparece habilitado e o
            que ele declara é lido, mas o módulo não é importado nesta versão —
            e quem instalou um precisa saber disso aqui, e não procurando na
            interface o que ele acrescentou. */}
        {extensao.principal ? (
          <p className="text-muted-foreground/70 truncate text-[10px]">
            Código ainda não carregado nesta versão.
          </p>
        ) : null}
      </div>

      {tambemTema ? (
        <span
          className="text-muted-foreground flex shrink-0 items-center gap-1 text-[10px] uppercase"
          title="Esta extensão também traz um tema."
        >
          <Palette className="size-3" aria-hidden />
          Tema
        </span>
      ) : null}

      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive size-7 shrink-0"
        aria-label={`Desinstalar ${extensao.nome}`}
        onClick={() => void remover(extensao.id)}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  );
}
