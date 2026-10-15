"use client";

import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

import { CampoDoFio, ListaDoFio, type MencoesDoFio } from "@/components/fio/fio";
import { ConfirmarRemocao } from "@/components/mestre/confirmar-remocao";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useMencoesDoMestre } from "@/hooks/use-mencoes-do-mestre";
import { usePlayers } from "@/hooks/use-players";
import { useConfiguracao } from "@/lib/configuracoes/registro";
import { textoDaRolagem } from "@/lib/fio";
import { t } from "@/lib/i18n/mestre";
import type { Sugestao } from "@/lib/mencoes/sugestao";
import {
  apagarDoFio,
  CHAVE_DADOS_ABERTOS,
  definirDadosAbertos,
  falarNoFio,
  type DestinoDoMestre,
} from "@/lib/mestre/fio-actions";
import { useFioStore } from "@/lib/store/use-fio-store";
import { call } from "@/lib/vault/bridge";
import type { LinhaDoFio } from "@/types/fio";

/**
 * O chat da mesa, como janela da bancada: o fio da campanha.
 *
 * A conversa e as rolagens, gravadas pelo daemon no `chat.jsonl` da campanha
 * — a memória da mesa, que sobrevive à sessão. As rolagens entram como linhas
 * para a conversa fazer sentido ("17! acertei?"), mas a janela do DADO é a de
 * Rolagens: o que está na mesa agora, e as regras de rolagem que a mesa
 * tiver. Duas janelas, duas perguntas.
 *
 * Fora dos planos do palco, como toda janela: abrir o fio não pode custar
 * quadro ao mapa. A lista tem teto (`LINHAS_NA_TELA`), e o dado que cai nela
 * usa o relógio da bandeja, que morre quando o último pousa.
 */
export function ChatBody() {
  const linhas = useFioStore((state) => state.linhas);
  const aoVivo = useFioStore((state) => state.aoVivo);
  const ler = useFioStore((state) => state.ler);

  // Com a janela à vista, nada fica por ler. Ver `naoLidas`.
  useEffect(() => {
    ler(true);
    return () => ler(false);
  }, [ler]);

  const [apagando, setApagando] = useState<LinhaDoFio | null>(null);

  /**
   * O `@personagem`, com o índice dos postits: o mesmo elenco, a mesma ordem
   * (quem está na mesa primeiro) e o mesmo clique, que abre a ficha.
   */
  const { vinculos, candidatos } = useMencoesDoMestre();
  const mencoes = useMemo<MencoesDoFio>(
    () => ({
      personagem: (nome) => {
        const achado = vinculos.personagem(nome);

        return achado
          ? { id: achado.id, nome: achado.nome, dono: achado.dono, ativo: achado.presente }
          : null;
      },
      abrir: (personagemId) => vinculos.abrirJanela({ tipo: "personagem", personagemId }),
      desconhecido: "aviso",
    }),
    [vinculos],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ListaDoFio
        linhas={linhas}
        aoVivo={aoVivo}
        leitor={{ tipo: "mestre" }}
        denso
        onApagar={setApagando}
        abrirLink={abrirNoNavegador}
        mencoes={mencoes}
        vazio={
          <PainelVazio conteudo={{ tipo: "chat" }}>
            {t.chat.vazio}
          </PainelVazio>
        }
      />

      <CampoDoMestre personagens={candidatos["@"]} />

      <ConfirmarRemocao
        aberto={apagando !== null}
        onAberto={(aberto) => {
          if (!aberto) setApagando(null);
        }}
        titulo={t.chat.apagarTitulo}
        itens={[
          apagando?.texto
            ? `"${resumo(apagando.texto)}"`
            : apagando?.rolagem
              ? textoDaRolagem(apagando.rolagem)
              : "",
        ]}
        ressalva={t.chat.apagarRessalva}
        onConfirmar={() => {
          const alvo = apagando;
          setApagando(null);
          if (!alvo) return;

          void apagarDoFio(alvo.id).catch((causa) =>
            toast.error(t.chat.naoApagou, {
              description: causa instanceof Error ? causa.message : undefined,
            }),
          );
        }}
      />
    </div>
  );
}

/** O começo de um texto longo, para caber na pergunta. */
function resumo(texto: string): string {
  return texto.length > 80 ? `${texto.slice(0, 80)}…` : texto;
}

/**
 * O link do chat sai para o navegador do sistema: dentro da webview do Mestre
 * um `<a target="_blank">` não abre nada. Mesmas duas portas de
 * `AbrirEspectador`.
 */
function abrirNoNavegador(url: string): void {
  void openUrl(url).catch(() =>
    call<string>("abrir_no_navegador", { url }).catch(() =>
      toast.error(t.chat.linkNaoAbriu, { description: url }),
    ),
  );
}

/** Quanto tempo a lista de jogadores do destino espera entre leituras. */
const SONDAGEM_DE_JOGADORES_MS = 30_000;

/** O valor do seletor: a mesa, o próprio Mestre, ou `jogador:{id}`. */
type ValorDoDestino = "mesa" | "mestre" | `jogador:${string}`;

/**
 * O campo do Mestre, com o destino e o interruptor dos dados abertos.
 *
 * O destino VOLTA para a mesa depois de cada sussurro. Ficar preso num jogador
 * é o caminho para o Mestre mandar a frase seguinte, que era para todos, só
 * para um — e ninguém na mesa perceber que não recebeu.
 */
function CampoDoMestre({ personagens }: { personagens: Sugestao[] }) {
  const { players } = usePlayers(SONDAGEM_DE_JOGADORES_MS);
  const [destino, setDestino] = useState<ValorDoDestino>("mesa");

  const abertos = useConfiguracao<boolean>(CHAVE_DADOS_ABERTOS) === true;

  // O jogador que saiu da mesa deixa de ser destino. Derivado no render, e não
  // corrigido num efeito.
  const destinoValido =
    destino.startsWith("jogador:") &&
    !players.some((jogador) => `jogador:${jogador.id}` === destino)
      ? "mesa"
      : destino;

  function para(): DestinoDoMestre | undefined {
    if (destinoValido === "mesa") return undefined;
    if (destinoValido === "mestre") return { tipo: "mestre" };

    return { tipo: "jogador", id: destinoValido.slice("jogador:".length) };
  }

  const rotulos: Record<string, string> = {
    mesa: t.chat.paraAMesa,
    mestre: t.chat.soParaMim,
    ...Object.fromEntries(
      players.map((jogador) => [`jogador:${jogador.id}`, t.chat.soPara(jogador.nome)]),
    ),
  };

  return (
    <CampoDoFio
      denso
      personagens={personagens}
      tituloDosPersonagens={t.chat.personagensDaCampanha}
      placeholder={
        destinoValido === "mesa"
          ? t.chat.escreverParaAMesa
          : `${rotulos[destinoValido]}…`
      }
      onEnviar={async (texto) => {
        await falarNoFio({ texto, para: para() });
        setDestino("mesa");
      }}
      antes={
        <>
          <Select<string>
            value={destinoValido}
            onValueChange={(valor) => {
              if (valor) setDestino(valor as ValorDoDestino);
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-6 min-w-0 flex-1 text-xs"
              aria-label={t.chat.paraQuem}
            >
              <SelectValue>
                {(valor: string) => rotulos[valor] ?? rotulos.mesa}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="mesa" className="text-xs">
                {rotulos.mesa}
              </SelectItem>
              <SelectItem value="mestre" className="text-xs">
                {rotulos.mestre}
              </SelectItem>
              {players.map((jogador) => (
                <SelectItem
                  key={jogador.id}
                  value={`jogador:${jogador.id}`}
                  className="text-xs"
                >
                  {rotulos[`jogador:${jogador.id}`]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Os dados do saquinho e da paleta. Desligado eles entram no fio
              também, mas só para o Mestre. Ver `CHAVE_DADOS_ABERTOS`. */}
          <label className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-[11px]">
            <Switch
              size="sm"
              checked={abertos}
              onCheckedChange={definirDadosAbertos}
              aria-label={t.chat.dadosAbertosRotulo}
            />
            {t.chat.dadosAbertos}
          </label>
        </>
      }
    />
  );
}
