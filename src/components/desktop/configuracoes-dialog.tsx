"use client";

import { useState } from "react";
import {
  Keyboard,
  Minus,
  Moon,
  Plus,
  Puzzle,
  Settings,
  SlidersHorizontal,
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
import { atalhosPorGrupo } from "@/lib/operator/atalhos";
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
    <Dialog>
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
      <DialogContent className="gap-0 p-0 sm:max-w-[min(48rem,calc(100%-2rem))]">
        <div className="flex h-[min(32rem,80vh)] min-h-0">
          {/* `min-w-36` embaixo dos 30%: num gerenciador de janelas de mosaico
              a janela do aplicativo fica estreita de verdade, e 30% de pouco é
              uma coluna onde "Área de transferência" não caberia. */}
          <nav className="bg-muted/30 flex w-[30%] min-w-36 shrink-0 flex-col gap-3 border-r p-2">
            <div className="px-1.5 pt-1">
              <DialogTitle>Configurações</DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                Desta máquina, não da campanha.
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
function PainelTeclado() {
  const grupos = atalhosPorGrupo();

  return (
    <>
      <TituloSecao ajuda="Ainda não dá para trocar as teclas. Esta é a lista do que existe.">
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
 * Os plugins, antes de existirem.
 *
 * Seção presente e honesta: ela diz que não há nenhum e que importar ainda não
 * funciona, em vez de oferecer um botão que abre um seletor de arquivos para um
 * formato que ninguém definiu. O botão desabilitado com o motivo à vista é o
 * que anuncia o assunto sem prometer a data.
 */
function PainelPlugins() {
  return (
    <>
      <TituloSecao ajuda="Nenhum plugin importado.">Plugins</TituloSecao>

      <Button variant="outline" size="sm" disabled className="w-full">
        <Puzzle />
        Importar plugin
      </Button>

      <p className="text-muted-foreground text-xs">
        Ainda não dá: o formato do plugin e onde ele mora na máquina não estão
        decididos.
      </p>
    </>
  );
}
