"use client";

import { useMemo, useState } from "react";
import { Braces, FileJson, RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useConfiguracoesStore } from "@/lib/configuracoes/registro";
import {
  escoposDe,
  linhaDoErro,
  resolver,
  type Definicao,
  type Escopo,
} from "@/lib/configuracoes/valor";
import { normaliza } from "@/lib/search";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import { abrirArquivoDeConfiguracoes } from "@/lib/vault/configuracoes";

/**
 * A configuração bate com o que foi digitado? Pelo título, pela chave ou pela
 * descrição, sem acento: "condicao" acha "Condição".
 *
 * Exportada porque a Configuração da campanha faz a mesma pergunta para saber
 * se o tópico Ajustes entra no resultado. Duas contas divergiriam no primeiro
 * ajuste de uma delas.
 */
export function bateNaBusca(definicao: Definicao, busca: string): boolean {
  const termo = normaliza(busca.trim());
  if (!termo) return true;

  return [definicao.titulo, definicao.chave, definicao.descricao ?? ""].some(
    (texto) => normaliza(texto).includes(termo),
  );
}

/**
 * As configurações do escopo que batem com a busca, agrupadas por dono.
 *
 * ATO20 primeiro, depois os plugins por nome: é a ordem em que se procura, e o
 * nome do plugin é o índice.
 */
function useGruposDeAjustes(escopo: Escopo, busca: string) {
  const definicoes = useConfiguracoesStore((state) => state.definicoes);
  const extensoes = useExtensoesStore((state) => state.extensoes);

  const nomeDoDono = useMemo(() => {
    const nomes = new Map<string, string>([["ato20", "ATO20"]]);
    for (const extensao of extensoes) nomes.set(extensao.id, extensao.nome);

    return (dono: string) => nomes.get(dono) ?? dono;
  }, [extensoes]);

  const grupos = useMemo(() => {
    const visiveis = Object.values(definicoes).filter(
      (d) => escoposDe(d).includes(escopo) && bateNaBusca(d, busca),
    );

    const porDono = new Map<string, Definicao[]>();
    for (const d of visiveis) porDono.set(d.dono, [...(porDono.get(d.dono) ?? []), d]);

    return [...porDono.entries()].sort(([a], [b]) =>
      a === "ato20" ? -1 : b === "ato20" ? 1 : nomeDoDono(a).localeCompare(nomeDoDono(b)),
    );
  }, [definicoes, escopo, busca, nomeDoDono]);

  return { grupos, nomeDoDono };
}

/** Os grupos, um cabeçalho por dono e uma linha por configuração. */
function Grupos({
  grupos,
  nomeDoDono,
  escopo,
}: {
  grupos: [string, Definicao[]][];
  nomeDoDono: (dono: string) => string;
  escopo: Escopo;
}) {
  const valores = useConfiguracoesStore((state) => state.valores);

  return grupos.map(([dono, lista]) => (
    <section key={dono} className="flex flex-col gap-1">
      <h3 className="text-muted-foreground px-1 pt-1 text-[10px] font-medium tracking-wide uppercase">
        {nomeDoDono(dono)}
      </h3>
      <ul className="flex flex-col divide-y">
        {lista.map((definicao) => (
          <Linha
            key={definicao.chave}
            definicao={definicao}
            escopo={escopo}
            origem={resolver(definicao, valores).origem}
          />
        ))}
      </ul>
    </section>
  ));
}

/**
 * Só o escopo da CAMPANHA, sem abas nem JSON: o tópico Ajustes da
 * Configuração da campanha.
 *
 * A busca vem de fora porque lá ela é uma só para todos os tópicos. O arquivo
 * cru continua nas Configurações gerais, que é onde mora a edição à mão dos
 * dois escopos lado a lado.
 */
export function AjustesDaCampanha({ busca }: { busca: string }) {
  const carregada = useConfiguracoesStore((state) => state.carregado.campanha);
  const erro = useConfiguracoesStore((state) => state.erro.campanha);
  const { grupos, nomeDoDono } = useGruposDeAjustes("campanha", busca);

  if (!carregada)
    return (
      <p className="text-muted-foreground text-[11px]">Lendo…</p>
    );

  return (
    <div className="flex flex-col gap-3">
      {erro ? (
        <p className="text-destructive text-xs" role="alert">
          O arquivo não pôde ser lido, e nada será gravado nele até ser consertado:{" "}
          <span className="font-mono">{erro}</span>
        </p>
      ) : null}
      <Grupos grupos={grupos} nomeDoDono={nomeDoDono} escopo="campanha" />
    </div>
  );
}

/**
 * Tudo que dá para ajustar, gerado do registro.
 *
 * É a tela de Settings do VSCode, nas duas formas dela: a lista de campos
 * desenhada a partir do que cada dono declarou, e o arquivo cru para quem
 * prefere editar JSON. As duas mexem no mesmo `configuracoes.json`, e trocar
 * de uma para a outra mostra o mesmo estado.
 *
 * Dois escopos em abas, e não os dois misturados: uma linha por chave com
 * duas colunas de valor confundiria qual vale. Na aba da máquina a linha diz
 * quando a campanha está mandando, e vice-versa -- o que vale nunca fica
 * escondido, só o controle é do escopo aberto.
 *
 * Agrupado por dono, ATO20 primeiro: a pergunta de quem abre aqui é "onde
 * está a configuração daquele plugin", e o nome do plugin é o índice.
 */
export function ListaDeConfiguracoes() {
  const carregado = useConfiguracoesStore((state) => state.carregado);
  const erro = useConfiguracoesStore((state) => state.erro);

  const [escopo, setEscopo] = useState<Escopo>("maquina");
  const [busca, setBusca] = useState("");
  const [modoJson, setModoJson] = useState(false);

  const { grupos, nomeDoDono } = useGruposDeAjustes(escopo, busca);

  const semCampanha = escopo === "campanha" && !carregado.campanha;

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={escopo} onValueChange={(valor) => setEscopo(valor as Escopo)}>
        <TabsList className="w-full">
          <TabsTrigger value="maquina" className="flex-1">
            Máquina
          </TabsTrigger>
          <TabsTrigger value="campanha" className="flex-1">
            Campanha
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar configuração"
            aria-label="Buscar configuração"
            className="h-8 pl-8 text-sm"
            disabled={modoJson}
          />
        </div>
        <Button
          variant={modoJson ? "secondary" : "outline"}
          size="sm"
          aria-pressed={modoJson}
          onClick={() => setModoJson((atual) => !atual)}
          disabled={semCampanha}
        >
          <Braces />
          JSON
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Abrir o arquivo no editor"
          title="Abrir o arquivo no editor"
          onClick={() => void abrirArquivoDeConfiguracoes(escopo).catch(() => {})}
          disabled={semCampanha}
        >
          <FileJson />
        </Button>
      </div>

      {erro[escopo] ? (
        <p className="text-destructive text-xs" role="alert">
          O arquivo não pôde ser lido, e nada será gravado nele até ser consertado:{" "}
          <span className="font-mono">{erro[escopo]}</span>
        </p>
      ) : null}

      {semCampanha ? (
        <p className="text-muted-foreground px-1 py-6 text-center text-xs">
          Abra uma campanha para ajustar o que vale só nela.
        </p>
      ) : modoJson ? (
        <EditorJson escopo={escopo} />
      ) : grupos.length === 0 ? (
        <p className="text-muted-foreground px-1 py-6 text-center text-xs">
          {busca ? "Nada com esse nome" : "Nada para ajustar neste escopo"}
        </p>
      ) : (
        <Grupos grupos={grupos} nomeDoDono={nomeDoDono} escopo={escopo} />
      )}
    </div>
  );
}

/**
 * Uma configuração: o que é, e o controle do escopo aberto.
 *
 * O controle mostra o valor que VALE, e não o gravado neste escopo, porque é
 * o que o mestre vê acontecer. Mexer nele grava neste escopo. O "Padrão"
 * aparece só quando há o que desfazer aqui.
 */
function Linha({
  definicao,
  escopo,
  origem,
}: {
  definicao: Definicao;
  escopo: Escopo;
  origem: Escopo | "padrao";
}) {
  const valores = useConfiguracoesStore((state) => state.valores);
  const gravar = useConfiguracoesStore((state) => state.gravar);
  const limpar = useConfiguracoesStore((state) => state.limpar);

  const { valor } = resolver(definicao, valores);
  const gravadoAqui = definicao.chave in valores[escopo];
  const outroManda = origem !== "padrao" && origem !== escopo;

  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{definicao.titulo}</p>
        {definicao.descricao ? (
          <p className="text-muted-foreground text-xs">{definicao.descricao}</p>
        ) : null}
        <p className="text-muted-foreground/60 font-mono text-[10px]">
          {definicao.chave}
          {outroManda ? (
            <span className="text-muted-foreground ml-2 font-sans">
              · vale o da {origem === "campanha" ? "campanha" : "máquina"}
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {gravadoAqui ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Voltar ao padrão"
            title="Voltar ao padrão"
            onClick={() => limpar(definicao.chave, escopo)}
          >
            <RotateCcw />
          </Button>
        ) : null}
        <Controle
          definicao={definicao}
          valor={valor}
          onChange={(novo) => gravar(definicao.chave, novo, escopo)}
        />
      </div>
    </li>
  );
}

/** O controle de cada tipo. Um por tipo, e é tudo que a lista gerada sabe. */
function Controle({
  definicao,
  valor,
  onChange,
}: {
  definicao: Definicao;
  valor: unknown;
  onChange: (valor: unknown) => void;
}) {
  switch (definicao.tipo) {
    case "booleano":
      return (
        <Switch
          checked={valor === true}
          onCheckedChange={onChange}
          aria-label={definicao.titulo}
        />
      );
    case "numero":
      return (
        <NumberField
          value={typeof valor === "number" ? valor : null}
          onValueChange={(novo) => {
            if (novo !== null) onChange(novo);
          }}
          min={definicao.minimo}
          max={definicao.maximo}
          step={definicao.passo}
          aria-label={definicao.titulo}
          className="h-8"
        />
      );
    case "texto":
      return (
        <Input
          value={typeof valor === "string" ? valor : ""}
          onChange={(evento) => onChange(evento.target.value)}
          aria-label={definicao.titulo}
          className="h-8 w-40 text-sm"
        />
      );
    case "escolha":
      return (
        <Select<string>
          value={typeof valor === "string" ? valor : null}
          onValueChange={(novo) => {
            if (novo) onChange(novo);
          }}
        >
          <SelectTrigger className="h-8 w-40 text-sm" aria-label={definicao.titulo}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(definicao.opcoes ?? []).map((opcao) => (
              <SelectItem key={opcao} value={opcao} className="text-sm">
                {opcao}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
  }
}

/**
 * O arquivo cru, para editar à mão.
 *
 * Um `textarea` em monoespaçada, e não um editor de código: o projeto não tem
 * nenhum, e trazer um pela primeira vez para um arquivo de dez linhas pesaria
 * no bundle do Mestre para todo mundo. O que um editor daria a mais é
 * realce -- e a validação, que aqui existe: JSON inválido não salva, e a linha
 * do erro aparece embaixo quando o motor a dá.
 *
 * Salva o objeto INTEIRO, chave desconhecida inclusive: o mestre pode estar
 * escrevendo a de um plugin que vai instalar depois.
 */
function EditorJson({ escopo }: { escopo: Escopo }) {
  const valores = useConfiguracoesStore((state) => state.valores[escopo]);
  const substituir = useConfiguracoesStore((state) => state.substituir);

  const noDisco = useMemo(() => JSON.stringify(valores, null, 2), [valores]);
  const [texto, setTexto] = useState(noDisco);
  const [falha, setFalha] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const mudou = texto !== noDisco;

  const erroDeSintaxe = useMemo(() => {
    try {
      const lido: unknown = JSON.parse(texto);
      if (typeof lido !== "object" || lido === null || Array.isArray(lido))
        return "A raiz tem de ser um objeto.";

      return null;
    } catch (causa) {
      const linha = linhaDoErro(texto, causa);
      const mensagem = causa instanceof Error ? causa.message : String(causa);

      return linha ? `Linha ${linha}: ${mensagem}` : mensagem;
    }
  }, [texto]);

  async function salvar() {
    if (erroDeSintaxe || !mudou) return;

    setSalvando(true);
    setFalha(null);
    try {
      await substituir(escopo, JSON.parse(texto) as Record<string, unknown>);
    } catch (causa) {
      setFalha(causa instanceof Error ? causa.message : "Falha ao gravar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        spellCheck={false}
        aria-label="Configurações em JSON"
        className="min-h-64 font-mono text-xs leading-relaxed"
      />

      {erroDeSintaxe || falha ? (
        <p className="text-destructive text-xs" role="alert">
          {erroDeSintaxe ?? falha}
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          Só o que difere do padrão fica aqui. Chave de plugin que ainda não está
          instalado pode ficar: ela passa a valer quando ele entrar.
        </p>
      )}

      <div className="flex justify-end gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          disabled={!mudou || salvando}
          onClick={() => setTexto(noDisco)}
        >
          Descartar
        </Button>
        <Button
          size="sm"
          disabled={!mudou || Boolean(erroDeSintaxe) || salvando}
          onClick={() => void salvar()}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}
