"use client";

import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Copy, QrCode, WifiOff } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  escolherRede,
  gravarEnderecoProprio,
  useEnderecoProprio,
  useEscolhaDeRede,
} from "@/lib/configuracoes/rede";
import {
  baseDoEndereco,
  disponiveis,
  escolherEndereco,
  ESCOLHAS_DE_REDE,
  NOME_DA_REDE,
  type EnderecoDetectado,
  type EscolhaDeRede,
  type EstadoDoTailscale,
  type ProblemaDoTailscale,
} from "@/lib/endereco-da-mesa";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import {
  abrirFunil,
  call,
  daemonAddr,
  enderecosDetectados,
  fecharFunil,
  tailscaleEstado,
} from "@/lib/vault/bridge";
import { cn } from "@/lib/utils";

/**
 * Como a mesa entra.
 *
 * Substitui o crachá de convite que existia com o Supabase, e o problema é
 * outro: lá o link era um domínio estável e o que faltava era o código; aqui o
 * endereço é o IP desta máquina na rede local, que ninguém decora.
 *
 * As duas abas resolvem isso de formas diferentes porque os dois aparelhos são
 * diferentes. O CELULAR tem câmera: o QR leva endereço e código de uma vez, e
 * ninguém digita nada. A TV não tem câmera — o que existe ali é um navegador e
 * um controle remoto —, então a aba dela mostra o endereço grande, para ser
 * lido do outro lado da sala e digitado. O QR que estava ali era uma imagem que
 * a TV não tem como usar.
 *
 * O código vai no endereço nos dois casos, e é por isso que não há nenhum campo
 * de código em lugar nenhum.
 *
 * E a REDE é escolha do mestre: a local, uma VPN de jogo que esteja ligada
 * nesta máquina, a internet pelo Funnel do Tailscale (o jogador só abre o
 * link), ou um endereço que ele cola. Nenhum servidor do ATO20 no meio. Ver
 * `lib/endereco-da-mesa.ts` e `src-tauri/src/tailscale.rs`.
 */
/** As duas portas da mesa: o celular de quem joga, e a TV que todos veem. */
type Aba = "jogador" | "espectador";

/** O que o Rust respondeu da última vez que se perguntou pelas redes. */
type Redes = { porta: number; detectados: EnderecoDetectado[] };

export function TableInvite() {
  const campaign = useCampaignStore((state) => state.campaign);
  const escolha = useEscolhaDeRede();
  const texto = useEnderecoProprio();
  const [redes, setRedes] = useState<Redes | null>(null);
  const [tailscale, setTailscale] = useState<EstadoDoTailscale | null>(null);
  // Abrindo ou fechando o Funnel: a CLI leva segundos na primeira vez, e o
  // botão parado nesse meio tempo seria clicado de novo.
  const [mexendo, setMexendo] = useState(false);
  // A aba escolhida vira estado porque a descrição do diálogo muda com
  // ela: o `Tabs` sozinho guardaria a escolha, mas não a conta a quem
  // está fora dele.
  const [aba, setAba] = useState<Aba>("jogador");
  const [carregado, setCarregado] = useState(false);

  // De novo a cada abertura do diálogo, e não só na montagem: a VPN ligada no
  // meio da tarde tem de aparecer sem reabrir o aplicativo, e a que caiu tem
  // de sumir antes de alguém fotografar um QR morto.
  const detectar = useCallback(() => {
    void Promise.all([daemonAddr(), enderecosDetectados()]).then(
      ([{ porta }, detectados]) => {
        setRedes({ porta, detectados });
        setCarregado(true);
      },
      () => setCarregado(true),
    );
    // À parte, e não no mesmo `Promise.all`: a CLI do Tailscale pode levar
    // segundos, e a rede local não tem por que esperar por ela.
    void tailscaleEstado().then(setTailscale, () => setTailscale(null));
  }, []);

  const mexerNoFunil = (acao: () => Promise<EstadoDoTailscale>) => {
    setMexendo(true);
    void acao()
      .then(setTailscale, (causa: unknown) =>
        setTailscale((anterior) =>
          anterior
            ? {
                ...anterior,
                problema: {
                  tipo: "outro",
                  mensagem: causa instanceof Error ? causa.message : String(causa),
                },
              }
            : anterior,
        ),
      )
      .finally(() => setMexendo(false));
  };

  useEffect(() => detectar(), [detectar]);

  if (!campaign || !carregado) return null;

  const proprio = redes ? baseDoEndereco(texto, redes.porta) : null;

  // Sem rota de rede a mesa não alcança esta máquina, e um endereço que não
  // responde é pior que dizer o que está faltando.
  const enderecos = redes ? disponiveis(redes.detectados, tailscale) : [];

  if (!redes || (enderecos.length === 0 && !proprio)) {
    return (
      <Tooltip
        onOpenChange={(aberto) => {
          if (aberto) detectar();
        }}
      >
        <TooltipTrigger
          render={
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <WifiOff className="size-3.5" />
              Sem rede
            </span>
          }
        />
        <TooltipContent>
          <p className="max-w-52">
            Esta máquina não está em rede nenhuma, então a TV e os celulares não
            têm como alcançá-la. Conecte o Wi-Fi, o cabo ou a VPN.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const mesa = escolherEndereco(escolha, enderecos, proprio);
  // "Outro" sem endereço que preste não cai para a rede local como uma VPN
  // desligada: o mestre está digitando, e um QR de outra rede no meio disso
  // seria o convite errado com cara de certo. A internet fechada também não:
  // o que falta ali é abrir, e o painel dela diz como.
  const esperandoEndereco = escolha === "outro" && !proprio;
  const esperandoFunil = escolha === "internet" && !tailscale?.funil;
  const usada = esperandoEndereco || esperandoFunil ? null : mesa;

  // A escolha aparece mesmo quando não respondeu, para o mestre ver o que
  // está marcado e por que o convite mostra outra coisa. A internet aparece
  // com o Tailscale logado, aberta ou não: é dali que ela se abre.
  const opcoes = ESCOLHAS_DE_REDE.filter(
    (opcao) =>
      opcao === "outro" ||
      opcao === escolha ||
      (opcao === "internet"
        ? tailscale?.online === true
        : enderecos.some((endereco) => endereco.rede === opcao)),
  );
  const temVpn = enderecos.some((endereco) => endereco.rede !== "local");

  return (
    <Dialog
      onOpenChange={(aberto) => {
        if (aberto) detectar();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            <QrCode />
            <span className="hidden lg:inline">Entrar na mesa</span>
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogTitle>Entrar na mesa</DialogTitle>
        {/* Uma por aba: o celular tem câmera e um quadrado para apontar, a TV
            não tem nem uma nem outro -- lá alguém digita o endereço com um
            controle remoto. Uma frase só serviria a uma das duas e mentiria
            para a outra.

            E diz o que a tela PEDE, não como o endereço é montado: que o
            código viaja na URL era resposta para uma pergunta que ninguém faz
            com o celular na mão. */}
        <DialogDescription>
          {aba === "jogador"
            ? "Aponte a câmera do celular para o quadrado."
            : "Digite este endereço no navegador da TV."}
        </DialogDescription>

        {/* Botões e não um select: com a rede local e o "Outro" sempre ali, a
            VPN ligada aparece como uma opção a mais à vista, e é assim que o
            mestre descobre que a mesa vai pela internet. */}
        <div className="flex flex-wrap gap-1" role="group" aria-label="Rede">
          {opcoes.map((opcao) => (
            <Button
              key={opcao}
              size="xs"
              variant={opcao === escolha ? "secondary" : "ghost"}
              aria-pressed={opcao === escolha}
              onClick={() => escolherRede(opcao)}
            >
              {NOME_DA_REDE[opcao]}
            </Button>
          ))}
        </div>

        {escolha === "outro" && (
          <div className="space-y-1">
            <Input
              value={texto}
              onChange={(evento) => gravarEnderecoProprio(evento.target.value)}
              placeholder="pc.tailnet.ts.net ou 10.147.17.5"
              aria-label={NOME_DA_REDE.outro}
              aria-invalid={esperandoEndereco && texto.trim() !== ""}
              className="h-8 text-sm"
            />
            {esperandoEndereco && texto.trim() !== "" && (
              <p className="text-destructive text-xs">Esse endereço não dá para usar.</p>
            )}
          </div>
        )}

        {escolha === "internet" && (
          <PainelDoFunil
            tailscale={tailscale}
            mexendo={mexendo}
            onAbrir={() => mexerNoFunil(abrirFunil)}
            onFechar={() => mexerNoFunil(fecharFunil)}
          />
        )}

        {usada?.caiu && (
          <p className="text-muted-foreground text-xs">{avisoDeQueda(escolha, usada.rede)}</p>
        )}

        {usada && (
          <Tabs
            value={aba}
            onValueChange={(valor) => setAba(valor as Aba)}
            className="min-w-0 gap-3"
          >
            <TabsList>
              <TabsTrigger value="jogador">Jogador</TabsTrigger>
              <TabsTrigger value="espectador">TV</TabsTrigger>
            </TabsList>

            <TabsContent value="jogador" className="min-w-0 space-y-3">
              <Alvo url={`${usada.url}/jogador?code=${campaign.codigo}`} />
            </TabsContent>

            {/* Sem QR: a TV não tem câmera para apontar para coisa nenhuma. O que
                acontece ali é alguém digitando o endereço no navegador dela, com
                um controle remoto — então o que a tela precisa dar é o endereço
                legível e inteiro, não um quadrado preto.

                E sem instrução escrita: a aba se chama TV, mostra um endereço e
                um botão de copiar. O parágrafo que havia aqui explicava o que os
                três já dizem. */}
            <TabsContent value="espectador" className="min-w-0 space-y-3">
              <Endereco
                url={`${usada.url}/espectador?code=${campaign.codigo}`}
                grande
              />
            </TabsContent>
          </Tabs>
        )}

        {/* Mais apagado que a tela: é a letra miúda do convite, e quem a
            procura já parou para ler. A ressalva do código fica porque é a
            única que muda uma decisão -- quem acha que ele protege a mesa de
            um vizinho precisa saber que não. */}
        <p className="text-muted-foreground/60 border-t pt-3 text-xs">
          {letraMiuda(usada?.rede ?? escolha, temVpn)}
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** Por que o convite não mostra a rede que está marcada. */
function avisoDeQueda(escolha: EscolhaDeRede, usada: EscolhaDeRede): string {
  const quem =
    escolha === "local"
      ? "A rede local"
      : escolha === "internet"
        ? "A internet"
        : `O ${NOME_DA_REDE[escolha]}`;
  const onde = usada === "local" ? "a rede local" : `o ${NOME_DA_REDE[usada]}`;

  return `${quem} não respondeu nesta máquina, então o convite usa ${onde}.`;
}

/**
 * Quem o endereço alcança, e o que o código protege, rede por rede.
 *
 * Na VPN, a dica é a do firewall porque é a que mais trava: o Windows costuma
 * tratar o adaptador dela como rede pública, e a permissão dada na primeira
 * abertura do ATO20 vale só para a privada.
 */
function letraMiuda(rede: EscolhaDeRede, temVpn: boolean): string {
  switch (rede) {
    case "local":
      return (
        "Vale só na mesma rede. O código evita a entrada por acaso, não alguém decidido no seu Wi-Fi." +
        (temVpn
          ? ""
          : " Para jogar pela internet, ligue o Tailscale, o Hamachi ou o Radmin aqui e nos aparelhos da mesa: a rede aparece nesta lista.")
      );
    case "outro":
      return "Vale para quem alcança esse endereço. Se ele estiver aberto na internet, o código não segura alguém decidido.";
    case "internet":
      return "Vale para qualquer pessoa com o link e o código, de qualquer lugar. O ATO20 fecha a porta quando você sai dele.";
    default:
      return `Vale para quem entrou na sua rede do ${NOME_DA_REDE[rede]}. Se alguém não conseguir abrir, libere o ATO20 no firewall do Windows também para rede pública.`;
  }
}

/**
 * O QR de um endereço, com o endereço legível embaixo.
 *
 * Só para o CELULAR. O QR existe porque o endereço é o IP desta máquina na rede
 * local, que ninguém decora e ninguém deveria digitar num teclado de vidro — a
 * câmera resolve isso. A TV não tem câmera, e lá o mesmo quadrado seria uma
 * imagem que ninguém consegue usar; ver a aba dela.
 */
function Alvo({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    void QRCode.toDataURL(url, {
      margin: 1,
      width: 320,
      // Claro sempre, e não seguindo o tema: quem lê é a câmera de um celular,
      // e QR invertido é o caso que mais falha em leitor.
      color: { dark: "#000000ff", light: "#ffffffff" },
    }).then(
      (gerado) => {
        if (ativo) setDataUrl(gerado);
      },
      () => {
        // Sem QR a mesa ainda entra pelo endereço escrito abaixo.
        if (ativo) setDataUrl(null);
      },
    );

    return () => {
      ativo = false;
    };
  }, [url]);

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-3">
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt={`QR code para ${url}`}
          className="size-48 rounded-md bg-white p-2"
        />
      ) : (
        <div className="bg-muted size-48 animate-pulse rounded-md" />
      )}

      <Endereco url={url} />
    </div>
  );
}

/**
 * O endereço escrito, e o botão de copiá-lo.
 *
 * Separado do QR porque a aba da TV usa só isto. `grande` é o tamanho de quem
 * vai LER e digitar de longe — na aba do celular o endereço é a legenda de
 * baixo do QR, e ninguém o digita.
 */
function Endereco({ url, grande }: { url: string; grande?: boolean }) {
  const [copiado, setCopiado] = useState(false);

  // `min-w-0` em cada degrau da cadeia — aqui, no `Tabs`, no `TabsContent`:
  // item de flex e de grid tem `min-width: auto`, que é o tamanho do CONTEÚDO,
  // e um endereço que não cabe empurrava a caixa para fora do diálogo em vez de
  // rolar dentro dela.
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-2">
      <code
        className={cn(
          // `block`: `<code>` é inline, e em elemento inline `overflow` e
          // `width` não valem nada. Era o que fazia a linha vazar o diálogo.
          "block w-full min-w-0 text-center select-all",
          grande
            ? // Uma LINHA só, com rolagem lateral se não couber -- e não quebra
              // por caractere. Quebrando, "espectador" virava "assist" numa linha
              // e "ir" na outra, e quem está copiando isso para o controle da TV
              // lê dois pedaços e digita um deles errado.
              // `scroll-fade-x`: a linha não cabe, e cortada a seco ela
              // parecia um endereço que termina ali. Desbotando na borda,
              // ela diz que continua -- e continua rolando.
              "bg-muted rolagem-limpa scroll-fade-x overflow-x-auto rounded-md px-3 py-2 text-left text-sm whitespace-nowrap"
            : "text-muted-foreground text-xs break-all",
        )}
      >
        {url}
      </code>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(url).then(
            () => setCopiado(true),
            // `clipboard` exige contexto seguro; em HTTP na rede local ele
            // falha, e o endereço continua legível na tela.
            () => setCopiado(false),
          );
        }}
      >
        {copiado ? <Check /> : <Copy />}
        {copiado ? "Copiado" : "Copiar endereço"}
      </Button>
    </div>
  );
}

/**
 * Abrir e fechar a mesa para a internet.
 *
 * Fechada, diz o que abrir significa ANTES do clique: qualquer pessoa com o
 * link e o código entra, e isso é uma decisão, não um detalhe. Aberta, o QR
 * logo abaixo já é o endereço público, e aqui fica só o botão de fechar.
 *
 * Cada problema vem com a saída dele, e não com a mensagem da CLI: quem joga
 * RPG não tem obrigação de saber o que é um operador do tailscaled.
 */
function PainelDoFunil({
  tailscale,
  mexendo,
  onAbrir,
  onFechar,
}: {
  tailscale: EstadoDoTailscale | null;
  mexendo: boolean;
  onAbrir: () => void;
  onFechar: () => void;
}) {
  if (!tailscale) {
    return <p className="text-muted-foreground text-xs">Perguntando ao Tailscale…</p>;
  }

  if (tailscale.funil) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground min-w-0 truncate text-xs">
          Aberta em {tailscale.funil.replace("https://", "")}
        </p>
        <Button size="xs" variant="ghost" disabled={mexendo} onClick={onFechar}>
          {mexendo ? "Fechando…" : "Fechar"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tailscale.problema ? (
        <ProblemaDoFunil problema={tailscale.problema} />
      ) : (
        <p className="text-muted-foreground text-xs">
          A mesa fica aberta para qualquer pessoa com o link e o código, até você fechar ou
          sair do ATO20.
        </p>
      )}
      {tailscale.online && (
        <Button size="sm" variant="secondary" disabled={mexendo} onClick={onAbrir}>
          {mexendo ? "Abrindo…" : "Abrir para a internet"}
        </Button>
      )}
    </div>
  );
}

/**
 * O painel do Tailscale no navegador do sistema. As mesmas duas portas do
 * link do chat: o `opener`, e o Rust quando ele desiste. Se as duas falharem,
 * o link vai no aviso para ser copiado, em vez de o botão não fazer nada.
 */
function abrirLink(url: string): void {
  void openUrl(url).catch(() =>
    call<string>("abrir_no_navegador", { url }).catch(() =>
      toast.error("Não foi possível abrir o navegador.", { description: url }),
    ),
  );
}

function ProblemaDoFunil({ problema }: { problema: ProblemaDoTailscale }) {
  switch (problema.tipo) {
    case "desconectado":
      return (
        <p className="text-muted-foreground text-xs">
          O Tailscale desta máquina está desconectado. Entre nele e abra o convite de novo.
        </p>
      );
    case "funilNaoLiberado":
      return (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">
            Falta liberar o Funnel na sua conta do Tailscale. Libere e clique em abrir de
            novo.
          </p>
          <Button size="xs" variant="ghost" onClick={() => abrirLink(problema.link)}>
            Liberar o Funnel
          </Button>
        </div>
      );
    case "semOperador":
      return (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">
            O Linux só deixa o Tailscale abrir a porta para quem é operador dele. Rode isto
            uma vez no terminal e clique em abrir de novo:
          </p>
          <code className="bg-muted block rounded-md px-2 py-1 text-xs select-all">
            {problema.comando}
          </code>
        </div>
      );
    case "portaOcupada":
      return (
        <p className="text-muted-foreground text-xs">
          O Funnel desta máquina já serve outra coisa na porta 443. Feche aquilo para abrir
          a mesa.
        </p>
      );
    case "outro":
      return (
        <p className="text-destructive text-xs">O Tailscale não abriu: {problema.mensagem}</p>
      );
  }
}
