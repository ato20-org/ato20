import { call } from "@/lib/vault/bridge";

/** O MCP desta máquina, como as Configurações o mostram. Ver `src-tauri/src/mcp.rs`. */
export type EstadoDoMcp = {
  ligado: boolean;
  /** `null` até a primeira vez que o mestre liga. */
  token: string | null;
  /** O endereço que o cliente usa, com a porta de verdade. */
  url: string;
};

export function estadoDoMcp(): Promise<EstadoDoMcp> {
  return call<EstadoDoMcp>("mcp_estado");
}

export function ligarMcp(ligado: boolean): Promise<EstadoDoMcp> {
  return call<EstadoDoMcp>("mcp_ligar", { ligado });
}

export function trocarTokenDoMcp(): Promise<EstadoDoMcp> {
  return call<EstadoDoMcp>("mcp_trocar_token");
}
