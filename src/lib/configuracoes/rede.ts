import {
  useConfiguracao,
  useConfiguracoesStore,
  valorDe,
} from "@/lib/configuracoes/registro";
import type { Definicao } from "@/lib/configuracoes/valor";
import {
  baseDoEndereco,
  disponiveis,
  escolherEndereco,
  ESCOLHAS_DE_REDE,
  type EnderecoDaMesa,
  type EscolhaDeRede,
} from "@/lib/endereco-da-mesa";
import { daemonAddr, enderecosDetectados, tailscaleEstado } from "@/lib/vault/bridge";

/**
 * Por qual rede o convite chama a mesa.
 *
 * Da MÁQUINA, e não da campanha: o endereço da tailnet do mestre é deste
 * computador. Levado no zip para outro, ele chamaria os jogadores para uma
 * máquina que não é a que está com a campanha aberta.
 *
 * A escolha guarda a REDE, e não o IP: com a VPN desligada o convite volta
 * para a rede local sozinho, e com ela ligada de novo volta para ela.
 */
export const CHAVE_DA_REDE = {
  escolha: "rede.convite",
  endereco: "rede.enderecoProprio",
} as const;

const DEFINICOES_DA_REDE: Definicao[] = [
  {
    chave: CHAVE_DA_REDE.escolha,
    titulo: "Rede do convite",
    descricao:
      "Por onde a mesa entra. As VPNs aparecem no convite quando estão ligadas nesta máquina, e a internet quando o Tailscale está logado.",
    tipo: "escolha",
    opcoes: ESCOLHAS_DE_REDE,
    padrao: "local",
    escopo: "maquina",
    dono: "ato20",
  },
  {
    chave: CHAVE_DA_REDE.endereco,
    titulo: "Outro endereço",
    descricao:
      "Um nome ou IP que a mesa alcança, como o do MagicDNS do Tailscale ou do ZeroTier. Sem porta, vale a do ATO20.",
    tipo: "texto",
    padrao: "",
    escopo: "maquina",
    dono: "ato20",
  },
];

useConfiguracoesStore.getState().definir(DEFINICOES_DA_REDE);

function comoEscolha(valor: unknown): EscolhaDeRede {
  return ESCOLHAS_DE_REDE.includes(valor as EscolhaDeRede)
    ? (valor as EscolhaDeRede)
    : "local";
}

/** A rede escolhida, como hook, para o convite marcar o botão dela. */
export function useEscolhaDeRede(): EscolhaDeRede {
  return comoEscolha(useConfiguracao(CHAVE_DA_REDE.escolha));
}

/** O endereço que o mestre digitou, como hook. */
export function useEnderecoProprio(): string {
  const valor = useConfiguracao(CHAVE_DA_REDE.endereco);
  return typeof valor === "string" ? valor : "";
}

/**
 * Grava a escolha. A rede local é o padrão e APAGA a chave, como o padrão do
 * quadro: o arquivo da máquina guarda só o que difere.
 */
export function escolherRede(escolha: EscolhaDeRede): void {
  const { gravar, limpar } = useConfiguracoesStore.getState();

  if (escolha === "local") limpar(CHAVE_DA_REDE.escolha, "maquina");
  else gravar(CHAVE_DA_REDE.escolha, escolha, "maquina");
}

export function gravarEnderecoProprio(texto: string): void {
  const { gravar, limpar } = useConfiguracoesStore.getState();

  if (texto.trim()) gravar(CHAVE_DA_REDE.endereco, texto, "maquina");
  else limpar(CHAVE_DA_REDE.endereco, "maquina");
}

/**
 * O endereço que a mesa usa agora: o do convite e o que um plugin recebe
 * como `rede`. Pergunta ao Rust a cada vez, porque a VPN pode ter subido ou
 * caído desde a última.
 */
export async function enderecoDaMesa(): Promise<EnderecoDaMesa | null> {
  const [{ porta }, detectados, tailscale] = await Promise.all([
    daemonAddr(),
    enderecosDetectados(),
    // Sem a CLI a mesa ainda tem a rede local: a falha dela não derruba o
    // endereço, só tira o Funnel da conta.
    tailscaleEstado().catch(() => null),
  ]);
  const texto = valorDe<string>(CHAVE_DA_REDE.endereco) ?? "";

  return escolherEndereco(
    comoEscolha(valorDe(CHAVE_DA_REDE.escolha)),
    disponiveis(detectados, tailscale),
    baseDoEndereco(texto, porta),
  );
}
