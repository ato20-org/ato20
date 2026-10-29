"use client";

import { useEffect, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { t } from "@/lib/i18n/desktop";
import { VaultError } from "@/lib/vault/bridge";
import { estadoDoMcp, ligarMcp, trocarTokenDoMcp, type EstadoDoMcp } from "@/lib/vault/mcp";

/**
 * O MCP: a chave que deixa uma IA desta máquina mexer na campanha, e o que o
 * cliente precisa para entrar.
 *
 * Desligado de fábrica, e a explicação diz o alcance antes da chave: é uma
 * porta para um programa criar e mudar coisas na campanha, e quem a abre tem
 * de saber disso ao abrir, e não descobrir depois. Ver `src-tauri/src/mcp.rs`.
 *
 * O comando do Claude Code vem pronto, com o token dentro: é o cliente que o
 * mestre mais provavelmente tem, e montar o comando à mão com o cabeçalho é
 * onde quem não programa desiste.
 */
export function SecaoMcp() {
  const [estado, setEstado] = useState<EstadoDoMcp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let ativo = true;

    estadoDoMcp().then(
      (lido) => {
        if (ativo) setEstado(lido);
      },
      () => {
        if (ativo) setErro(t.configuracoes.mcp.erro);
      },
    );

    return () => {
      ativo = false;
    };
  }, []);

  async function mudar(acao: () => Promise<EstadoDoMcp>) {
    setOcupado(true);
    try {
      setEstado(await acao());
      setErro(null);
    } catch (cause) {
      setErro(cause instanceof VaultError ? cause.message : t.configuracoes.mcp.erro);
    } finally {
      setOcupado(false);
    }
  }

  const textos = t.configuracoes.mcp;
  const ligado = estado?.ligado === true;
  const token = estado?.token;

  return (
    <>
      <label className="flex items-start gap-3">
        <Switch
          checked={ligado}
          disabled={!estado || ocupado}
          onCheckedChange={(ligar) => void mudar(() => ligarMcp(ligar))}
          aria-label={textos.ligar}
        />
        <span className="min-w-0">
          <span className="block text-sm">{textos.ligar}</span>
          <span className="text-muted-foreground block text-xs">{textos.ligarExplicacao}</span>
        </span>
      </label>

      {erro ? <p className="text-destructive text-xs">{erro}</p> : null}

      {ligado && token && estado ? (
        <>
          <Separator />

          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm">{textos.claudeCode}</h3>
            <p className="text-muted-foreground text-xs">{textos.claudeCodeExplicacao}</p>
            <Copiavel texto={comandoDoClaudeCode(estado.url, token)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm">{textos.outros}</h3>
            <p className="text-muted-foreground text-xs">{textos.outrosExplicacao}</p>
            <Copiavel texto={configuracaoDoCliente(estado.url, token)} />
          </div>

          <p className="text-muted-foreground text-xs">{textos.precisaAberto}</p>

          <Separator />

          <div className="flex flex-col items-start gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={ocupado}
              onClick={() => void mudar(trocarTokenDoMcp)}
            >
              <RefreshCw />
              {textos.trocarToken}
            </Button>
            <p className="text-muted-foreground text-xs">{textos.trocarTokenExplicacao}</p>
          </div>
        </>
      ) : null}
    </>
  );
}

/** O comando que registra o ATO20 no Claude Code, no escopo do usuário: vale em qualquer pasta. */
function comandoDoClaudeCode(url: string, token: string): string {
  return `claude mcp add --scope user --transport http ato20 ${url} --header "Authorization: Bearer ${token}"`;
}

/** O bloco `mcpServers` que Cursor, VS Code e companhia leem. */
function configuracaoDoCliente(url: string, token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        ato20: { type: "http", url, headers: { Authorization: `Bearer ${token}` } },
      },
    },
    null,
    2,
  );
}

/** Um texto para copiar inteiro: o comando, a configuração. */
function Copiavel({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="flex min-w-0 items-start gap-2">
      {/* `block` e `min-w-0`: `<code>` é inline, e sem isto a linha longa do
          comando empurrava o diálogo em vez de quebrar dentro dele. */}
      <code className="bg-muted block min-w-0 flex-1 rounded-md px-2 py-1.5 font-mono text-xs break-all whitespace-pre-wrap select-all">
        {texto}
      </code>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={copiado ? t.configuracoes.mcp.copiado : t.configuracoes.mcp.copiar}
        title={copiado ? t.configuracoes.mcp.copiado : t.configuracoes.mcp.copiar}
        onClick={() => {
          void navigator.clipboard.writeText(texto).then(
            () => setCopiado(true),
            () => setCopiado(false),
          );
        }}
      >
        {copiado ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
