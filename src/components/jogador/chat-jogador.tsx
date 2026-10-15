"use client";

import { memo, useEffect, useMemo, useState } from "react";

import { CampoDoFio, ListaDoFio, type MencoesDoFio } from "@/components/fio/fio";
import { Switch } from "@/components/ui/switch";
import { t } from "@/lib/i18n/jogador";
import { personagensDaMesa, type PersonagemDaMesa } from "@/lib/player/caderno";
import { falarNoFio } from "@/lib/player/fio";
import { normaliza } from "@/lib/search";
import { useFioStore } from "@/lib/store/use-fio-store";
import { usePlayerStore } from "@/lib/store/use-player-store";

/**
 * O chat da mesa, no celular: o fio da campanha como este jogador o lê.
 *
 * A conversa chega pelo `useFioDoJogador`, assinado no shell; aqui é só a
 * leitura e o campo. O sussurro do jogador vai só ao Mestre — jogador com
 * jogador é conversa que a mesa tem na mesa.
 *
 * Não é a bandeja embaixo do retrato. Ela continua sendo o agora da mesa, e
 * isto é a memória: a rolagem de outro jogador some do retrato em trinta
 * segundos e fica aqui.
 */
export const ChatJogador = memo(function ChatJogador({
  codigo,
  emCena,
}: {
  codigo: string;
  /** Quem está com o retrato no ar. Ver `emCena`, no `JogadorShell`. */
  emCena: Set<string>;
}) {
  const eu = usePlayerStore((state) => state.sheet?.id ?? "");

  const linhas = useFioStore((state) => state.linhas);
  const aoVivo = useFioStore((state) => state.aoVivo);
  const pronto = useFioStore((state) => state.pronto);
  const ler = useFioStore((state) => state.ler);

  // Com o chat à vista, nada fica por ler. Ver `naoLidas`.
  useEffect(() => {
    ler(true);
    return () => ler(false);
  }, [ler]);

  const [soParaOMestre, setSoParaOMestre] = useState(false);

  /**
   * Os personagens que o `@` alcança: os da mesa, com jogador — a mesma rota
   * das menções do caderno. PNJ não vem, e não deve: o índice inteiro
   * entregaria a preparação do Mestre na aba de rede do navegador. O `@Aldren`
   * que o Mestre escrever chega como nome, sem vínculo. Ver `MencoesDoFio`.
   */
  const [personagens, setPersonagens] = useState<PersonagemDaMesa[]>([]);
  useEffect(() => {
    let ativo = true;

    void personagensDaMesa(codigo).then(
      (lista) => {
        if (ativo) setPersonagens(lista);
      },
      // Sem a lista, o `@` não sugere nada e a menção é texto. Um aviso no
      // chat por causa de uma sugestão que não veio seria pior que a ausência.
      () => {},
    );

    return () => {
      ativo = false;
    };
  }, [codigo]);

  const mencoes = useMemo<MencoesDoFio>(() => {
    const porNome = new Map(personagens.map((personagem) => [normaliza(personagem.nome), personagem]));

    return {
      personagem: (nome) => {
        const achado = porNome.get(normaliza(nome));

        return achado
          ? { id: achado.id, nome: achado.nome, dono: achado.dono, ativo: emCena.has(achado.id) }
          : null;
      },
      desconhecido: "nome",
    };
  }, [personagens, emCena]);

  // Quem está em cena primeiro: é quase sempre sobre quem se está falando.
  const candidatos = useMemo(
    () =>
      [...personagens]
        .sort((a, b) => Number(emCena.has(b.id)) - Number(emCena.has(a.id)))
        .map((personagem) => ({ nome: personagem.nome, detalhe: personagem.dono })),
    [personagens, emCena],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ListaDoFio
        linhas={linhas}
        aoVivo={aoVivo}
        leitor={{ tipo: "jogador", id: eu }}
        mencoes={mencoes}
        vazio={
          <p className="text-muted-foreground text-center text-sm">
            {pronto ? t.chat.vazio : t.chat.abrindo}
          </p>
        }
      />

      <CampoDoFio
        personagens={candidatos}
        tituloDosPersonagens={t.mencoes.personagens}
        placeholder={soParaOMestre ? t.chat.soParaOMestre : t.chat.escreverParaAMesa}
        onEnviar={async (texto) => {
          await falarNoFio(codigo, texto, soParaOMestre);
          // Volta para a mesa depois de cada sussurro: preso no sussurro, o
          // jogador mandaria só ao Mestre a frase seguinte, que era para todos.
          setSoParaOMestre(false);
        }}
        antes={
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            <Switch
              size="sm"
              checked={soParaOMestre}
              onCheckedChange={setSoParaOMestre}
            />
            {t.chat.soParaOMestre}
          </label>
        }
      />
    </div>
  );
}, mesmasProps);

/**
 * O chat só redesenha quando o que ele mostra muda.
 *
 * A aba é filha do layout que recebe o QUADRO inteiro da mesa, e o quadro chega
 * a cada publicação do Mestre — até dez por segundo enquanto ele arrasta um
 * token. Cada quadro é um JSON novo, então o `emCena` que vem dele é um
 * conjunto novo mesmo quando ninguém entrou nem saiu de cena; comparado por
 * identidade, ele redesenharia as duzentas linhas do fio a cada quadro.
 * Comparado pelo conteúdo, só quando um retrato entra ou sai.
 */
function mesmasProps(
  antes: { codigo: string; emCena: Set<string> },
  depois: { codigo: string; emCena: Set<string> },
): boolean {
  if (antes.codigo !== depois.codigo) return false;
  if (antes.emCena.size !== depois.emCena.size) return false;

  for (const id of antes.emCena) if (!depois.emCena.has(id)) return false;

  return true;
}
