"use client";

import {
  Frame,
  Moon,
  RotateCcw,
  Settings2,
  Sun,
  Tags,
  Tv,
} from "lucide-react";

import { useState } from "react";
import { toast } from "sonner";

import { CeuDoSol } from "@/components/mestre/ceu-do-sol";
import { Opcao } from "@/components/mestre/painel-do-pincel";
import { GridControl } from "@/components/mestre/grid-control";
import { ARCO_IRIS } from "@/components/mestre/menu-da-luz";
import { ReguasDaImagem } from "@/components/mestre/reguas-da-imagem";
import { SeletorDeCor } from "@/components/mestre/seletor-de-cor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { corDoVazioDe } from "@/lib/cor";
import { TRAVA_EM_GRAUS } from "@/lib/geometry/ceu";
import { corDoEscuroDe, limitarEscuridao } from "@/lib/geometry/luz";
import { t } from "@/lib/i18n/ferramentas";
import type { AjusteDeImagem } from "@/lib/imagem-do-espectador";
import {
  escolherCeuDaCena,
  tirarCeuDaCena,
  useFundoEmVoo,
} from "@/lib/mestre/scene-background";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { cn } from "@/lib/utils";
import {
  CORES_DO_ESCURO,
  CORES_DO_VAZIO,
  SOL_PADRAO,
  temLuz,
  type Scene,
  type Sol,
} from "@/types/scene";

/**
 * As configurações DESTE mapa, no canto do palco.
 *
 * O que mora aqui é o que vale para a cena inteira e se ajusta uma vez: não é
 * gesto sobre o mapa, e por isso não é ferramenta. A barra de ferramentas é a
 * mão -- o que se pega para desenhar, medir, cravar --, e o sol não se pega:
 * ele se liga e se aponta, e depois fica ligado a sessão toda. Estava numa
 * bolsa de ferramentas, atrás de dois cliques, junto de coisas que se usam a
 * cada minuto.
 *
 * No canto de cima à direita, ao lado de quem está na mesa, porque é o canto de
 * CONSULTA e ajuste: do outro lado ficam o painel recolhido e o índice de
 * pontos, e embaixo, colada ao mapa, a mão. Aqui nada é gesto sobre o palco.
 *
 * Só no mapa. Num quadro não há chão para o sol cair.
 */
export function ConfiguracoesDoMapa({ scene }: { scene: Scene }) {
  const setSol = useSceneStore((state) => state.setSol);
  const setEscuridao = useSceneStore((state) => state.setEscuridao);
  const setCorDoEscuro = useSceneStore((state) => state.setCorDoEscuro);
  const setCorDoVazio = useSceneStore((state) => state.setCorDoVazio);
  const setInfoDosTokens = useSceneStore((state) => state.setInfoDosTokens);
  const setImagem = useSceneStore((state) => state.setImagem);

  const sol = scene.sol;
  const ligado = Boolean(sol);

  function ajustar(patch: Partial<Sol>) {
    setSol(scene.id, { ...(sol ?? SOL_PADRAO), ...patch });
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.configuracoesDoMapa.titulo}
                >
                  <Settings2 />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          <p className="font-medium">{t.configuracoesDoMapa.titulo}</p>
          <p className="text-muted-foreground max-w-48">
            {t.configuracoesDoMapa.tituloAjuda}
          </p>
        </TooltipContent>
      </Tooltip>

      {/* Rola quando não couber: são dois assuntos com régua cada um, e num
          portátil de tela baixa o fim do painel ficava fora da janela. */}
      <PopoverContent
        align="end"
        className="max-h-[min(70vh,34rem)] w-72 space-y-4 overflow-y-auto"
        side="bottom"
      >
        <p className="text-sm font-medium">{t.configuracoesDoMapa.titulo}</p>

        <section className="space-y-3">
          {/* O interruptor na LINHA do título, e não um botão à parte: aqui o
              sol não é uma ferramenta que se pega, é um estado da cena. Ver o
              cabeçalho deste arquivo. */}
          <div className="flex items-center justify-between gap-2">
            <Label
              className="flex items-center gap-2 text-xs font-normal"
              htmlFor="sol-da-cena"
            >
              <Sun className="text-muted-foreground size-3.5" />
              {t.configuracoesDoMapa.sol}
            </Label>
            <Switch
              id="sol-da-cena"
              checked={ligado}
              onCheckedChange={(ligar) =>
                setSol(scene.id, ligar ? SOL_PADRAO : undefined)
              }
            />
          </div>

          <p className="text-muted-foreground text-[10px] leading-snug">
            {t.configuracoesDoMapa.solAjuda}
          </p>

          {/* O céu ACIMA da força, e fora do bloco que só existe com o sol
              aceso: ele é o retrato do que o interruptor faz, e sumir quando o
              sol apaga esconderia justamente isso. Apagado ele fica sem cor e
              sem resposta ao toque -- ver `CeuDoSol`.

              A direção e o comprimento saíram de duas réguas, uma em graus e
              outra em porcento: ninguém mestra pensando "a sombra cai a 305
              graus". A força fica em régua porque ela não tem gesto no mundo --
              é quão escura a sombra é, e isso se regula olhando o mapa. */}
          <Campo
            rotulo={t.configuracoesDoMapa.solNoCeu}
            valor={
              sol
                ? `${sol.angulo}° · ${Math.round(sol.comprimento * 100)}%`
                : ""
            }
          >
            <CeuDoSol
              sol={sol ?? SOL_PADRAO}
              desabilitado={!ligado}
              onChange={ajustar}
            />
          </Campo>

          {ligado && sol ? (
            <div className="space-y-4">
              <p className="text-muted-foreground text-[10px] leading-snug">
                {t.configuracoesDoMapa.arrasteSol(TRAVA_EM_GRAUS)}
              </p>

              <Campo
                rotulo={t.configuracoesDoMapa.forca}
                valor={`${Math.round(sol.forca * 100)}%`}
              >
                <Slider
                  aria-label={t.configuracoesDoMapa.forca}
                  value={[Math.round(sol.forca * 100)]}
                  min={5}
                  max={80}
                  step={5}
                  onValueChange={(value) =>
                    ajustar({ forca: primeiro(value) / 100 })
                  }
                />
              </Campo>

              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-7 w-full px-2 text-xs"
                onClick={() => ajustar(SOL_PADRAO)}
              >
                <RotateCcw className="size-3" />
                {t.configuracoesDoMapa.solPadrao}
              </Button>
            </div>
          ) : null}
        </section>

        {temLuz(scene) ? (
          <>
            <span className="bg-border block h-px w-full" />
            <Escuridao
              valor={limitarEscuridao(scene.escuridao)}
              onChange={(valor) => setEscuridao(scene.id, valor)}
              cor={corDoEscuroDe(scene.corDoEscuro)}
              onCor={(cor) => setCorDoEscuro(scene.id, cor)}
            />
          </>
        ) : null}

        {/* O avesso da escuridão: ela pinta o tom de DENTRO onde a luz não
            chega, esta pinta o que está FORA do mapa. Vizinhas porque as duas
            são cor da cena, e não ferramenta. */}
        <span className="bg-border block h-px w-full" />
        <ForaDoMapa
          cor={corDoVazioDe(scene.corDoVazio)}
          onCor={(cor) => setCorDoVazio(scene.id, cor)}
        />
        <CeuDoMapa scene={scene} />

        {/* Ainda cor da cena, mas só na TV: o mapa que o mestre vê aqui não
            muda, e a prévia é a Janela Mesa, pelo botão das réguas. */}
        <span className="bg-border block h-px w-full" />
        <ImagemDoMapa
          valor={scene.imagem}
          onChange={(imagem) => setImagem(scene.id, imagem)}
        />

        {/* O traço entre os dois: sol e grade valem os dois para a cena
            inteira, mas são assuntos diferentes -- um pinta sombra, o outro
            mede chão -- e sem a linha as duas fileiras de réguas viravam uma
            lista só. */}
        <span className="bg-border block h-px w-full" />

        <GridControl scene={scene} />

        <span className="bg-border block h-px w-full" />

        {/* Terceiro assunto da cena, ao lado do sol e da grade: o que vale para
            ela inteira e se ajusta uma vez. Aqui é o mapa de COMBATE -- a mesa
            quer a vida de todo mundo à vista sem ligar cada rosto a uma barra
            no canto da tela. No mapa da taverna, nada por cima das peças. */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label
              className="flex items-center gap-2 text-xs font-normal"
              htmlFor="info-dos-tokens"
            >
              <Tags className="text-muted-foreground size-3.5" />
              {t.configuracoesDoMapa.infoDosTokens}
            </Label>
            <Switch
              id="info-dos-tokens"
              checked={Boolean(scene.infoDosTokens)}
              onCheckedChange={(ligar) => setInfoDosTokens(scene.id, ligar)}
            />
          </div>

          <p className="text-muted-foreground text-[10px] leading-snug">
            {t.configuracoesDoMapa.infoDosTokensAjuda}
          </p>
        </section>
      </PopoverContent>
    </Popover>
  );
}

/**
 * O quanto o mapa escurece onde nenhuma luz chega. Ver `Scene.escuridao`.
 *
 * Régua e não interruptor: "noite" e "masmorra" são escuros diferentes, e o
 * mestre acerta o tom olhando a TV. Em zero o mapa é o de sempre, e as luzes
 * viram só brilho -- é o que deixa pôr uma tocha num mapa claro sem apagá-lo.
 *
 * Vizinha do sol, e não uma ferramenta: é estado da cena, como ele.
 */
function Escuridao({
  valor,
  onChange,
  cor,
  onCor,
}: {
  valor: number;
  onChange: (valor: number) => void;
  /** Já validada: o breu quando não há. Ver `corDoEscuroDe`. */
  cor: string;
  onCor: (cor: string) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label
          className="flex items-center gap-2 text-xs font-normal"
          htmlFor="escuridao-da-cena"
        >
          <Moon className="text-muted-foreground size-3.5" />
          {t.configuracoesDoMapa.escuridao}
        </Label>
        <span className="text-muted-foreground text-[10px] tabular-nums">
          {Math.round(valor * 100)}%
        </span>
      </div>

      <Slider
        id="escuridao-da-cena"
        aria-label={t.configuracoesDoMapa.escuridao}
        value={[Math.round(valor * 100)]}
        min={0}
        max={100}
        step={5}
        onValueChange={(value) => onChange(primeiro(value) / 100)}
      />

      <p className="text-muted-foreground text-[10px] leading-snug">
        {t.configuracoesDoMapa.escuridaoAjuda}
      </p>

      {/* O tom do escuro: a luz ambiente pelo avesso. */}
      <TomDeCor
        rotulo={t.configuracoesDoMapa.tom}
        cores={CORES_DO_ESCURO}
        nomes={NOME_DO_ESCURO}
        cor={cor}
        onCor={onCor}
      />
    </section>
  );
}

/**
 * A cor do que está FORA do mapa -- a sala em volta do chão, no 2D e no 2.5D.
 * Ver `Scene.corDoVazio`.
 *
 * O avesso da escuridão: aquela é o tom de DENTRO onde a luz não chega, esta é
 * o que cerca o mapa. Preto é o de sempre -- o mapa é a luz, e o escuro em
 * volta some da vista --, e quem quer uma mesa de feltro ou uma ardósia troca
 * aqui. A imagem do mapa cobre o chão de qualquer forma; o que muda é a borda,
 * e o chão só quando não há imagem.
 */
function ForaDoMapa({
  cor,
  onCor,
}: {
  /** Já validada: o breu quando não há. Ver `corDoVazioDe`. */
  cor: string;
  onCor: (cor: string) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Frame className="text-muted-foreground size-3.5" />
        {t.configuracoesDoMapa.foraDoMapa}
      </div>

      <TomDeCor
        rotulo={t.configuracoesDoMapa.cor}
        cores={CORES_DO_VAZIO}
        nomes={NOME_DO_VAZIO}
        cor={cor}
        onCor={onCor}
      />

      <p className="text-muted-foreground text-[10px] leading-snug">
        {t.configuracoesDoMapa.foraDoMapaAjuda}
      </p>
    </section>
  );
}

/**
 * O ajuste de imagem DESTE mapa na janela do espectador: a masmorra mais
 * clara, o flashback sem cor. Ver `Scene.imagem`.
 *
 * Por cima do ajuste da campanha, que é a calibração da TV: os dois valem, e
 * multiplicam -- ver `compor`. Só no mapa, como o resto deste painel.
 */
function ImagemDoMapa({
  valor,
  onChange,
}: {
  valor: AjusteDeImagem | undefined;
  onChange: (imagem: AjusteDeImagem | undefined) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Tv className="text-muted-foreground size-3.5" />
        {t.configuracoesDoMapa.imagem}
      </div>

      <ReguasDaImagem valor={valor} onChange={onChange} />

      <p className="text-muted-foreground text-[10px] leading-snug">
        {t.configuracoesDoMapa.imagemAjuda}
      </p>
    </section>
  );
}

/**
 * O céu do 2.5D: a cor de fora do mapa, ou uma imagem. Ver `Scene.ceuAssetId`.
 *
 * Embaixo da cor de fora, e não no lugar dela: a cor continua valendo no 2D e
 * por trás da imagem enquanto ela carrega. A escolha é o que fica atrás do chão
 * DEITADO -- e é por isso que se chama céu, e não fundo.
 *
 * "Imagem" sem céu ainda abre o seletor de arquivo na hora: escolher o modo e
 * depois procurar o botão de escolher seria um clique a mais para nada. Voltar
 * para "Cor" tira o céu e leva o arquivo junto, como tirar o mapa.
 */
function CeuDoMapa({ scene }: { scene: Scene }) {
  const comImagem = Boolean(scene.ceuAssetId);
  const miniatura = useAssetUrl(scene.ceuAssetId, "mini");
  const recebendo = useFundoEmVoo((state) =>
    state.cenas.includes(`ceu:${scene.id}`),
  );

  function escolher() {
    void escolherCeuDaCena(scene.id).catch((causa: unknown) =>
      toast.error(
        causa instanceof Error ? causa.message : t.configuracoesDoMapa.falhaNoCeu,
      ),
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs">{t.configuracoesDoMapa.ceu}</span>
        <div
          role="radiogroup"
          aria-label={t.configuracoesDoMapa.ceu}
          className="bg-muted flex w-36 rounded-md p-0.5"
        >
          <Opcao
            marcada={!comImagem}
            onClick={() => {
              if (comImagem) void tirarCeuDaCena(scene.id);
            }}
          >
            {t.configuracoesDoMapa.cor}
          </Opcao>
          <Opcao
            marcada={comImagem}
            onClick={() => {
              if (!comImagem && !recebendo) escolher();
            }}
          >
            {t.configuracoesDoMapa.ceuImagem}
          </Opcao>
        </div>
      </div>

      {comImagem ? (
        <div className="flex items-center gap-2">
          {miniatura ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={miniatura}
              alt=""
              draggable={false}
              className="h-8 w-16 rounded-sm border border-white/15 object-cover"
            />
          ) : (
            <span className="bg-muted h-8 w-16 rounded-sm" />
          )}
          <Button
            size="xs"
            variant="outline"
            disabled={recebendo}
            onClick={escolher}
          >
            {t.configuracoesDoMapa.trocarCeu}
          </Button>
        </div>
      ) : null}

      <p className="text-muted-foreground text-[10px] leading-snug">
        {t.configuracoesDoMapa.ceuAjuda}
      </p>
    </section>
  );
}

/**
 * Uma paleta curta de tons, e a cor livre atrás dela.
 *
 * O mesmo desenho da cor da luz, do tom do escuro e da cor do vazio: a paleta
 * na frente e o seletor do sistema no fim, para o tom exato. A borda clara em
 * volta de cada bolinha porque às vezes são quase pretos num fundo escuro.
 */
function TomDeCor({
  rotulo,
  cores,
  nomes,
  cor,
  onCor,
}: {
  rotulo: string;
  cores: readonly string[];
  /** O nome de cada cor da paleta, para o rótulo acessível de cada bolinha. */
  nomes: Record<string, string>;
  /** Já validada. */
  cor: string;
  onCor: (cor: string) => void;
}) {
  /** O seletor da cor livre, aberto dentro do popover. */
  const [livreAberto, setLivreAberto] = useState(false);
  const livre = !cores.includes(cor);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-[10px]">{rotulo}</span>
        <div
          role="radiogroup"
          aria-label={rotulo}
          className="flex items-center gap-1.5"
        >
          {cores.map((opcao) => (
            <button
              key={opcao}
              type="button"
              role="radio"
              aria-checked={cor === opcao}
              aria-label={nomes[opcao]}
              title={nomes[opcao]}
              className={cn(
                "focus-visible:ring-ring size-5 rounded-full border-2 outline-none focus-visible:ring-2",
                cor === opcao ? "border-foreground" : "border-white/25",
              )}
              style={{ backgroundColor: opcao }}
              onClick={() => onCor(opcao)}
            />
          ))}
          <button
            type="button"
            aria-label={t.configuracoesDoMapa.tomPersonalizado}
            aria-expanded={livreAberto}
            title={t.configuracoesDoMapa.tomPersonalizado}
            className={cn(
              "focus-visible:ring-ring size-5 shrink-0 rounded-full border-2 outline-none focus-visible:ring-2",
              livre || livreAberto ? "border-foreground" : "border-transparent",
            )}
            style={{ background: livre ? cor : ARCO_IRIS }}
            onClick={() => setLivreAberto((aberto) => !aberto)}
          />
        </div>
      </div>

      {livreAberto ? <SeletorDeCor cor={cor} onChange={onCor} /> : null}
    </div>
  );
}

/** O nome de cada tom, pelo lugar que ele pinta. */
const NOME_DO_ESCURO: Record<(typeof CORES_DO_ESCURO)[number], string> = {
  "#000000": t.configuracoesDoMapa.breu,
  "#0b1330": t.configuracoesDoMapa.noite,
  "#1c130b": t.configuracoesDoMapa.caverna,
  "#170a24": t.configuracoesDoMapa.abismo,
};

/** O nome de cada cor do vazio, pela sala que ela lembra. */
const NOME_DO_VAZIO: Record<(typeof CORES_DO_VAZIO)[number], string> = {
  "#000000": t.configuracoesDoMapa.breu,
  "#1c1917": t.configuracoesDoMapa.carvao,
  "#1e293b": t.configuracoesDoMapa.ardosia,
  "#14342b": t.configuracoesDoMapa.feltro,
};

function Campo({
  rotulo,
  valor,
  children,
}: {
  rotulo: string;
  valor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs font-normal">{rotulo}</Label>
        <span className="text-muted-foreground text-[10px] tabular-nums">
          {valor}
        </span>
      </div>
      {children}
    </div>
  );
}

function primeiro(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : (value as number);
}
