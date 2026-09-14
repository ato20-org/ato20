"use client";

import {
  FileText,
  Image as ImageIcon,
  NotebookPen,
  VenetianMask,
} from "lucide-react";

import type { ArquivoDoCaderno } from "@/hooks/use-mencoes-do-caderno";
import type { Token } from "@/lib/mencoes/texto";
import { parseNota, type TipoNaNota } from "@/lib/player/caderno-mencoes";
import { cn } from "@/lib/utils";

/**
 * Quem resolve nome em coisa, dentro de uma nota.
 *
 * Vem de fora, como no postit do mestre, e pelo mesmo motivo: os mapas de
 * personagem, de arquivo e de nota são montados uma vez na aba, não uma por
 * nota — um caderno de trinta notas com `@` não pode virar trinta leituras da
 * mesa.
 *
 * Cada função devolve `null` quando o nome não existe, e isso não é erro: quem
 * digita `@Tha` a caminho de `@Thalor` passa por aqui a cada tecla.
 */
export type VinculosDaNota = {
  personagem: (
    nome: string,
  ) => { nome: string; dono: string; emCena: boolean } | null;
  arquivo: (nome: string) => ArquivoDoCaderno | null;
  nota: (titulo: string) => { id: string; titulo: string } | null;
  /** Abre o arquivo mencionado, no mesmo visualizador da ficha. */
  abrirArquivo: (arquivo: ArquivoDoCaderno) => void;
  /** Pula para outra nota do caderno. */
  abrirNota: (id: string) => void;
};

/**
 * O ícone que abre cada referência.
 *
 * Existe pela razão que ele existe no postit: cor não diz o que a coisa É — ela
 * diz "isto é diferente daquilo". Numa linha com "@Corvo levou /corvo.png para
 * #O porão", os três nomes podem ser parecidos, e num celular não há mouse para
 * passar por cima e descobrir qual é qual.
 */
const ICONE = "inline-block size-[1em] shrink-0 translate-y-[0.1em]";

/**
 * O texto de uma nota, com os marcadores pintados.
 *
 * Só de leitura: enquanto o jogador digita, quem está na tela é o `<textarea>`
 * com o texto cru e os sinais à vista. A troca no foco é deliberada, e é a
 * mesma do postit — um editor que formata enquanto se digita esconde
 * justamente os caracteres que quem escreve precisa ver para saber se escreveu
 * `@Corvo` ou `@ Corvo`.
 */
export function NotaTextoView({
  texto,
  vinculos,
  className,
}: {
  texto: string;
  vinculos: VinculosDaNota;
  className?: string;
}) {
  const tokens = parseNota(texto);

  return (
    <div
      className={cn(
        "text-base leading-relaxed break-words whitespace-pre-wrap",
        className,
      )}
    >
      {tokens.map((token, indice) => (
        // Índice como chave: a lista é derivada do texto e refeita inteira a
        // cada tecla, então não há identidade estável a preservar.
        <TokenView key={indice} token={token} vinculos={vinculos} />
      ))}
    </div>
  );
}

function TokenView({
  token,
  vinculos,
}: {
  token: Token<TipoNaNota>;
  vinculos: VinculosDaNota;
}) {
  if (token.tipo === "texto") return <>{token.valor}</>;
  if (token.tipo === "quebra") return <br />;
  if (token.tipo === "bold")
    return <strong className="font-semibold">{token.valor}</strong>;

  if (token.tipo === "personagem") {
    const achado = vinculos.personagem(token.valor);
    if (!achado)
      return <NaoResolvido bruto={token.bruto} alvo="personagem na mesa" />;

    return (
      // Não é clicável: não há o que abrir. A ficha que o jogador alcança é a
      // dos personagens DELE, e mandar recado para o celular de quem joga o
      // outro é outra feature, que não existe.
      <span
        className="inline-flex items-baseline gap-[0.2em] font-medium text-sky-300"
        title={`${achado.nome} — ${achado.dono}`}
      >
        <VenetianMask
          className={cn(
            ICONE,
            // Verde é quem está EM CENA agora: o retrato dele está no ar, na
            // mesma tela, logo acima do caderno. É a informação que muda o que
            // a anotação quer dizer — "#o porão: @Corvo foi na frente" é sobre
            // o que está acontecendo, não sobre a semana passada.
            achado.emCena ? "text-emerald-400" : "text-sky-300/70",
          )}
          aria-hidden
        />
        {achado.nome}
      </span>
    );
  }

  if (token.tipo === "arquivo") {
    const arquivo = vinculos.arquivo(token.valor);
    if (!arquivo)
      return <NaoResolvido bruto={token.bruto} alvo="arquivo seu" />;

    const imagem = arquivo.anexo.mimeType.startsWith("image/");

    return (
      <button
        type="button"
        className="inline-flex items-baseline gap-[0.2em] font-medium text-teal-300 underline decoration-teal-300/40"
        title={`${arquivo.anexo.arquivo} — ${arquivo.personagemNome}`}
        onClick={() => vinculos.abrirArquivo(arquivo)}
      >
        {/* Imagem e documento com ícones diferentes: o tipo é o que decide o
            que acontece ao tocar — uma abre na tela, o outro abre no leitor de
            PDF —, e é a pergunta que se faz antes de tocar num celular. */}
        {imagem ? (
          <ImageIcon className={ICONE} aria-hidden />
        ) : (
          <FileText className={ICONE} aria-hidden />
        )}
        {arquivo.anexo.arquivo}
      </button>
    );
  }

  const nota = vinculos.nota(token.valor);
  if (!nota) return <NaoResolvido bruto={token.bruto} alvo="nota sua" />;

  return (
    <button
      type="button"
      className="inline-flex items-baseline gap-[0.2em] font-medium text-violet-300 underline decoration-violet-300/40"
      title={`Abrir a nota ${nota.titulo}`}
      onClick={() => vinculos.abrirNota(nota.id)}
    >
      <NotebookPen className={ICONE} aria-hidden />
      {nota.titulo}
    </button>
  );
}

/**
 * Marcador escrito, mas sem nada com esse nome.
 *
 * Mostra o texto CRU, com o sinal e as aspas: é a diferença entre "não achei" e
 * "não entendi". Vendo `@Corvo` de volta na tela, quem escreveu corrige o nome;
 * vendo só `Corvo` sem o sinal, acharia que errou o marcador.
 *
 * Acontece o tempo todo e é normal — cada tecla de um nome sendo digitado passa
 * por aqui —, então não pinta de vermelho nem avisa nada.
 */
function NaoResolvido({ bruto, alvo }: { bruto: string; alvo: string }) {
  return (
    <span
      className="text-muted-foreground underline decoration-dotted"
      title={`Nenhum ${alvo} com esse nome`}
    >
      {bruto}
    </span>
  );
}
