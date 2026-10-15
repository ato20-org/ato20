"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { BarreiraDeExtensao } from "@/components/mestre/barreira-de-extensao";
import { DeclarativoProvider } from "@/components/playground/declarativo";
import { PortraitLayer } from "@/components/playground/portrait-layer";
import { PalcoSoTela } from "@/components/playground/scene-stage";
import type { EfeitoPedido } from "@/lib/condicao";
import { t } from "@/lib/i18n/palco";
import { encaixarRetratos, lerPedidoDeRetratos, type RetratoParaKit } from "@/lib/kit-de-retratos";
import { buscarDeclarativo, DECLARATIVO_VAZIO, type Declarativo } from "@/lib/sync/declarativo";
import type { RolagemDaMesa } from "@/types/dado";

/**
 * De quanto em quanto tempo o kit pode reler o declarativo, no máximo.
 *
 * Ele relê quando chega um medidor com estilo de plugin que ainda não
 * conhece -- o mestre instalou um plugin no meio da sessão. Sem o teto, um
 * estilo que o Mestre recusou (SVG ilegível) faria cada pedido buscar de novo.
 */
const RELER_DECLARATIVO_MS = 5_000;

/**
 * O kit de retratos: os retratos pedidos pela página que o embute, desenhados
 * pelo mesmo `PortraitLayer` da janela do espectador. Ver `lib/kit-de-retratos.ts`.
 *
 * `encaixar` arruma os retratos na tela, lado a lado, com a composição inteira
 * cabendo -- é o card de uma pessoa numa caixa do OBS. Sem ele, cada retrato
 * fica onde a mesa o pôs, e a tela do kit espelha a da TV.
 */
export function KitDeRetratos({ codigo, encaixar }: { codigo: string | null; encaixar: boolean }) {
  const [retratos, setRetratos] = useState<RetratoParaKit[]>([]);
  const [rolagens, setRolagens] = useState<RolagemDaMesa[]>([]);
  const [declarativo, setDeclarativo] = useState<Declarativo>(DECLARATIVO_VAZIO);
  /** Muda a cada pedido: é o que deixa a barreira tentar de novo depois de um erro. */
  const [pedidos, setPedidos] = useState(0);
  const ultimaLeitura = useRef(0);

  useEffect(() => {
    const ouvir = (evento: MessageEvent) => {
      if (evento.source !== window.parent) return;
      const pedido = lerPedidoDeRetratos(evento.data);
      if (!pedido) return;

      setPedidos((n) => n + 1);
      if (pedido.tipo === "mostrar") setRetratos(pedido.retratos);
      else setRolagens(pedido.rolagens);
    };

    window.addEventListener("message", ouvir);
    window.parent.postMessage({ ato20: "retratos", pronto: true }, "*");

    return () => window.removeEventListener("message", ouvir);
  }, []);

  // Estilo ou efeito de plugin que o kit não conhece: relê o declarativo. É o
  // que traz o coração que esvazia em vez da barra de fábrica, e o sangue do
  // pack de efeitos em vez do retrato limpo.
  const estilosPedidos = useMemo(
    () =>
      [...new Set(retratos.flatMap((r) => (r.medidores ?? []).map((m) => m.estiloExtensao)))]
        .filter((estilo): estilo is string => Boolean(estilo))
        .sort()
        .join("|"),
    [retratos],
  );
  const efeitosPedidos = useMemo(
    () =>
      [...new Set(retratos.flatMap((r) => (r.efeitos ?? []).map((e) => e.efeito)))]
        // Só os de fora: o de fábrica o kit já desenha. Id de fora tem barra.
        .filter((efeito) => efeito.includes("/"))
        .sort()
        .join("|"),
    [retratos],
  );
  useEffect(() => {
    if (!codigo || (!estilosPedidos && !efeitosPedidos)) return;
    const falta = (pedidos: string, conhecidos: object) =>
      Boolean(pedidos) && pedidos.split("|").some((chave) => !Object.hasOwn(conhecidos, chave));
    if (!falta(estilosPedidos, declarativo.estilos) && !falta(efeitosPedidos, declarativo.efeitos))
      return;

    const agora = Date.now();
    if (agora - ultimaLeitura.current < RELER_DECLARATIVO_MS) return;
    ultimaLeitura.current = agora;

    let ativo = true;
    void buscarDeclarativo(codigo).then((novo) => {
      if (ativo) setDeclarativo(novo);
    });

    return () => {
      ativo = false;
    };
  }, [codigo, estilosPedidos, efeitosPedidos, declarativo]);

  const tela = useTamanhoDaJanela();
  const arrumados = useMemo(
    () =>
      encaixar && tela.altura > 0 ? encaixarRetratos(retratos, tela.largura / tela.altura) : retratos,
    [encaixar, retratos, tela.largura, tela.altura],
  );
  const efeitos = useMemo(
    () =>
      new Map<string, EfeitoPedido[]>(
        retratos.map((retrato) => [retrato.personagemId, retrato.efeitos ?? []]),
      ),
    [retratos],
  );

  if (tela.largura === 0) return null;

  return (
    <DeclarativoProvider valor={declarativo}>
      <PalcoSoTela largura={tela.largura} altura={tela.altura}>
        {/* Um retrato torto some com o resto até o próximo pedido, e o kit
            continua ouvindo. Sem aviso: numa live, o aviso seria pior que o
            buraco. */}
        <BarreiraDeExtensao nome={t.kit.retratos} chave={String(pedidos)} reserva={null}>
          <PortraitLayer
            portraits={arrumados}
            variant="mesa"
            espaco="tela"
            rolagens={rolagens}
            efeitos={efeitos}
          />
        </BarreiraDeExtensao>
      </PalcoSoTela>
    </DeclarativoProvider>
  );
}

/** O tamanho da janela, como estado. */
function useTamanhoDaJanela(): { largura: number; altura: number } {
  const texto = useSyncExternalStore(
    (avisar) => {
      window.addEventListener("resize", avisar);
      return () => window.removeEventListener("resize", avisar);
    },
    () => `${window.innerWidth}x${window.innerHeight}`,
    () => "0x0",
  );
  const [largura, altura] = texto.split("x").map(Number);

  return { largura, altura };
}
