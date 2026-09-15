"use client";

import { toast } from "sonner";

import { cn } from "@/lib/utils";

/** O que o Rust emite a cada bloco copiado. Espelho de `ProgressoImportacao`. */
export type ProgressoImportacao = {
  importacao: string;
  arquivo: string;
  copiado: number;
  total: number;
  /** `copiando` com bytes; `miniatura` sem medida, depois da cópia. */
  etapa: "copiando" | "miniatura";
};

/**
 * O toast que acompanha uma importação, do primeiro bloco ao último arquivo.
 *
 * Um só por lote, atualizado no lugar: enquanto copia mostra o arquivo da vez,
 * a barra, quanto já foi e a velocidade; ao terminar vira o resumo. Antes não
 * havia nada entre o clique e a lista mudar, e com o trabalho saindo da thread
 * principal a tela deixou de congelar — o que, sozinho, tira também o único
 * sinal de que algo estava acontecendo.
 *
 * O botão de cancelar está aqui, e não num painel: quem largou trinta mapas
 * por engano quer parar onde está olhando, que é o aviso.
 *
 * Mora ao lado do `importarCaminhos`, e não em cada tela, porque são cinco
 * portas de entrada — botão do acervo, arrasto no mapa, arrasto no painel,
 * fundo de cena, ficha — e todas passam por lá.
 */
export class AvisoDeImportacao {
  private readonly id = `importacao-${Math.random().toString(36).slice(2)}`;

  /** Índice do arquivo em cópia. Dá o "2 de 3". */
  private indice = 0;

  /** Velocidade suavizada, em bytes por segundo. `null` antes da 1ª medida. */
  private velocidade: number | null = null;

  private ultimaMedida: { em: number; bytes: number } | null = null;

  /** Bytes dos arquivos já concluídos, para a velocidade não zerar a cada troca. */
  private acumulado = 0;

  private cancelando = false;

  constructor(
    private readonly paths: string[],
    private readonly cancelar: () => void,
  ) {}

  /** Um arquivo novo começou. Zera a medida por arquivo, não a velocidade. */
  copiando(indice: number) {
    this.indice = indice;
    this.mostrar(null);
  }

  /** O Rust avisou quanto já foi do arquivo da vez. */
  progresso(evento: ProgressoImportacao) {
    // Miniatura não tem bytes: é decodificar e reduzir, e leva o que levar.
    // Aqui só troca o rótulo; a barra cheia da cópia fica e passa a pulsar.
    if (evento.etapa === "miniatura") {
      this.mostrar(evento);
      return;
    }

    const agora = performance.now();
    const bytesAteAqui = this.acumulado + evento.copiado;

    if (this.ultimaMedida) {
      const dt = (agora - this.ultimaMedida.em) / 1000;
      const db = bytesAteAqui - this.ultimaMedida.bytes;

      // Só mede com um intervalo que vale algo: dois eventos no mesmo
      // milissegundo dariam infinito.
      if (dt > 0.05 && db >= 0) {
        const instantanea = db / dt;
        this.velocidade =
          this.velocidade === null
            ? instantanea
            : this.velocidade * 0.7 + instantanea * 0.3;
        this.ultimaMedida = { em: agora, bytes: bytesAteAqui };
      }
    } else {
      this.ultimaMedida = { em: agora, bytes: bytesAteAqui };
    }

    if (evento.copiado >= evento.total) this.acumulado += evento.total;

    this.mostrar(evento);
  }

  terminou(entraram: number, recusados: string[], cancelado: boolean) {
    const total = this.paths.length;

    if (cancelado) {
      toast.info("Importação cancelada", {
        id: this.id,
        description:
          entraram > 0
            ? `${entraram} de ${total} ${entraram === 1 ? "entrou" : "entraram"} antes de parar`
            : "Nada entrou",
        action: undefined,
      });
      return;
    }

    if (recusados.length === 0) {
      toast.success(
        total === 1
          ? `${nomeDoArquivo(this.paths[0])} importado`
          : `${entraram} arquivos importados`,
        { id: this.id, description: undefined, action: undefined },
      );
      return;
    }

    // Recusa é aviso, não erro do aplicativo: o arquivo era o problema. Os
    // motivos, um por arquivo, quem mostra é `absorverImportacao` — aqui só a
    // conta, para o resumo caber numa linha.
    const conta = `${recusados.length} recusado${recusados.length > 1 ? "s" : ""}`;

    toast.warning(
      entraram === 0 ? `Nada entrou: ${conta}` : `${entraram} de ${total} importados`,
      {
        id: this.id,
        description: entraram === 0 ? undefined : conta,
        action: undefined,
      },
    );
  }

  morreu(entraram: number) {
    toast.error("A importação parou no meio", {
      id: this.id,
      description:
        entraram > 0
          ? `${entraram} de ${this.paths.length} entraram antes da falha`
          : undefined,
      action: undefined,
    });
  }

  private mostrar(evento: ProgressoImportacao | null) {
    const total = this.paths.length;
    const nome = evento?.arquivo ?? nomeDoArquivo(this.paths[this.indice]);
    const titulo = this.cancelando
      ? "Parando…"
      : total === 1
        ? `Importando ${nome}`
        : `Importando ${this.indice + 1} de ${total}`;

    toast.loading(titulo, {
      id: this.id,
      // Sem prazo: fica até `terminou` ou `morreu` trocar por outro.
      duration: Infinity,
      description: (
        <Andamento
          nome={total === 1 ? null : nome}
          copiado={evento?.copiado ?? 0}
          total={evento?.total ?? 0}
          velocidade={this.velocidade}
          miniatura={evento?.etapa === "miniatura"}
        />
      ),
      action: this.cancelando
        ? undefined
        : {
            label: "Cancelar",
            onClick: (event) => {
              // O toast fecharia ao clicar; ele tem de ficar para virar o
              // "cancelada" quando o Rust responder.
              event.preventDefault();
              this.cancelando = true;
              this.cancelar();
              this.mostrar(evento);
            },
          },
    });
  }
}

/** Barra, contagem de bytes e velocidade do arquivo em cópia. */
function Andamento({
  nome,
  copiado,
  total,
  velocidade,
  miniatura,
}: {
  nome: string | null;
  copiado: number;
  total: number;
  velocidade: number | null;
  /** A cópia acabou; a miniatura está sendo gerada, sem medida. */
  miniatura: boolean;
}) {
  const fracao = miniatura ? 1 : total > 0 ? Math.min(1, copiado / total) : 0;

  return (
    <div className="mt-1 flex flex-col gap-1">
      {nome ? <span className="truncate">{nome}</span> : null}
      <div
        className="bg-muted h-1 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fracao * 100)}
      >
        <div
          className={cn(
            "bg-primary h-full rounded-full transition-[width] duration-100",
            miniatura && "animate-pulse",
          )}
          style={{ width: `${fracao * 100}%` }}
        />
      </div>
      <span className="text-muted-foreground tabular-nums">
        {miniatura
          ? "Copiado · gerando miniatura…"
          : total > 0
            ? `${formatarBytes(copiado)} de ${formatarBytes(total)}`
            : "Preparando…"}
        {!miniatura && velocidade !== null && total > 0
          ? ` · ${formatarBytes(velocidade)}/s`
          : null}
      </span>
    </div>
  );
}

/** Só o nome, no separador do sistema de quem opera: barra ou contrabarra. */
export function nomeDoArquivo(path: string): string {
  return path.split(/[\\/]/).pop() || "arquivo";
}

/** "12,3 MB", "840 KB", "12 B". Uma casa só acima de megabyte. */
export function formatarBytes(bytes: number): string {
  if (bytes >= 1_073_741_824)
    return `${(bytes / 1_073_741_824).toFixed(1).replace(".", ",")} GB`;
  if (bytes >= 1_048_576)
    return `${(bytes / 1_048_576).toFixed(1).replace(".", ",")} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${Math.round(bytes)} B`;
}
