"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, QrCode, WifiOff } from "lucide-react";
import QRCode from "qrcode";

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
  escolherEndereco,
  ESCOLHAS_DE_REDE,
  NOME_DA_REDE,
  type EnderecoDetectado,
  type EscolhaDeRede,
} from "@/lib/endereco-da-mesa";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import { daemonAddr, enderecosDetectados } from "@/lib/vault/bridge";
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
 * nesta máquina (a mesa pela internet, sem servidor de ninguém no meio), ou um
 * endereço que ele cola. Ver `lib/endereco-da-mesa.ts`.
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
  }, []);

  useEffect(() => detectar(), [detectar]);

  if (!campaign || !carregado) return null;

  const proprio = redes ? baseDoEndereco(texto, redes.porta) : null;

  // Sem rota de rede a mesa não alcança esta máquina, e um endereço que não
  // responde é pior que dizer o que está faltando.
  if (!redes || (redes.detectados.length === 0 && !proprio)) {
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

  const mesa = escolherEndereco(escolha, redes.detectados, proprio);
  // "Outro" sem endereço que preste não cai para a rede local como uma VPN
  // desligada: o mestre está digitando, e um QR de outra rede no meio disso
  // seria o convite errado com cara de certo.
  const esperandoEndereco = escolha === "outro" && !proprio;
  const usada = esperandoEndereco ? null : mesa;

  // A escolha aparece mesmo quando não respondeu, para o mestre ver o que
  // está marcado e por que o convite mostra outra coisa.
  const opcoes = ESCOLHAS_DE_REDE.filter(
    (opcao) =>
      opcao === "outro" ||
      opcao === escolha ||
      redes.detectados.some((endereco) => endereco.rede === opcao),
  );
  const temVpn = redes.detectados.some((endereco) => endereco.rede !== "local");

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
  const quem = escolha === "local" ? "A rede local" : `O ${NOME_DA_REDE[escolha]}`;
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
