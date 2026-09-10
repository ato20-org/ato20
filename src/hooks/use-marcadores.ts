"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { isNoCampaign } from "@/lib/vault/bridge";
import {
  listarMarcadores,
  marcar as marcarNoBanco,
  removerMarcador,
  renomearMarcador,
  type Marcador,
} from "@/lib/vault/estante";

type MarcadoresApi = {
  marcadores: Marcador[];
  /**
   * Não há campanha aberta.
   *
   * Estado e não erro: o livro continua abrindo e sendo lido sem mesa — é o
   * ponto de a rota do daemon viver fora do `RwLock` da campanha. O que não
   * existe é a resposta para "quais páginas ESTA campanha marcou".
   */
  semCampanha: boolean;
  marcar: (pagina: number, rotulo: string) => Promise<void>;
  renomear: (id: string, rotulo: string) => Promise<void>;
  remover: (id: string) => Promise<void>;
};

/**
 * Os marcadores da campanha aberta neste livro.
 *
 * Por campanha, e não por máquina, porque a página que interessa muda de mesa:
 * a tabela de condições serve a campanha de horror, e a de veículos serve a
 * outra. Ficam no banco da máquina e não viajam no zip — o livro também não
 * viaja, e marcador exportado apontaria para um PDF que a outra máquina não
 * tem. Ver `Marcador` no `db.rs`.
 */
export function useMarcadores(livroId: string): MarcadoresApi {
  const [marcadores, setMarcadores] = useState<Marcador[]>([]);
  const [semCampanha, setSemCampanha] = useState(false);

  const recarregar = useCallback(() => {
    let ativo = true;

    void listarMarcadores(livroId).then(
      (lista) => {
        if (!ativo) return;

        setMarcadores(lista);
        setSemCampanha(false);
      },
      (cause) => {
        if (!ativo) return;

        setMarcadores([]);
        setSemCampanha(isNoCampaign(cause));

        if (!isNoCampaign(cause)) {
          toast.error(cause instanceof Error ? cause.message : "Falha ao ler os marcadores.");
        }
      },
    );

    return () => {
      ativo = false;
    };
  }, [livroId]);

  useEffect(() => recarregar(), [recarregar]);

  const marcar = useCallback(
    async (pagina: number, rotulo: string) => {
      try {
        const criado = await marcarNoBanco(livroId, pagina, rotulo);

        // Insere o que voltou em vez de reler a lista: o marcador aparece no
        // mesmo quadro em que o mestre o criou. A ordem é a do banco — página,
        // e o mais antigo desempatando.
        setMarcadores((atuais) =>
          [...atuais, criado].sort(
            (um, outro) => um.pagina - outro.pagina || um.criadoEm - outro.criadoEm,
          ),
        );
      } catch (cause) {
        if (isNoCampaign(cause)) {
          setSemCampanha(true);
          return;
        }

        toast.error(cause instanceof Error ? cause.message : "Falha ao marcar a página.");
      }
    },
    [livroId],
  );

  const renomear = useCallback(async (id: string, rotulo: string) => {
    const limpo = rotulo.trim();
    // Rótulo vazio não apaga o marcador: quem quer tirar a página da lista usa
    // o botão de remover. O Rust recusa igual, e sair aqui evita a ida.
    if (!limpo) return;

    try {
      await renomearMarcador(id, limpo);
      setMarcadores((atuais) =>
        atuais.map((marcador) => (marcador.id === id ? { ...marcador, rotulo: limpo } : marcador)),
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao renomear.");
    }
  }, []);

  const remover = useCallback(async (id: string) => {
    try {
      await removerMarcador(id);
      setMarcadores((atuais) => atuais.filter((marcador) => marcador.id !== id));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao remover o marcador.");
    }
  }, []);

  return { marcadores, semCampanha, marcar, renomear, remover };
}
