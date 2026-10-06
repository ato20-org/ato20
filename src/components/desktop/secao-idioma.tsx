"use client";

import { Languages } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfiguracao } from "@/lib/configuracoes/registro";
import { t } from "@/lib/i18n/desktop";
import {
  CHAVE_DO_MESTRE,
  ESCOLHAS_DE_IDIOMA,
  lerEscolha,
} from "@/lib/i18n/idioma";
import {
  escolhaAtual,
  escolherIdioma,
  rotulosDeIdioma,
} from "@/lib/i18n/trocar";

const ROTULOS = rotulosDeIdioma();

/**
 * O idioma da interface, no topo da seção Geral.
 *
 * Primeiro da seção porque é a chave que quem não lê o idioma da tela veio
 * procurar, e ele não vai ler a seção até achar. O ícone ajuda pelo mesmo
 * motivo: é o desenho que todo aplicativo usa para isto.
 *
 * Escolher grava, e quem recarrega é o `acompanharIdioma` -- o mesmo caminho
 * da lista de Ajustes e do arquivo editado à mão.
 */
export function SecaoIdioma() {
  // Assinado só para redesenhar quando muda. O valor vem do `escolhaAtual`,
  // que sabe esperar o arquivo: antes dele, o registro diria "do sistema"
  // sobre quem escolheu inglês.
  useConfiguracao(CHAVE_DO_MESTRE);
  const escolha = escolhaAtual();

  return (
    <section className="flex flex-col gap-2">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Languages className="text-muted-foreground size-3.5" aria-hidden />
          {t.configuracoes.idioma.titulo}
        </p>
        <p className="text-muted-foreground text-xs">
          {t.configuracoes.idioma.explicacao}
        </p>
      </div>

      <Select<string>
        items={ROTULOS}
        value={escolha}
        onValueChange={(novo) => {
          const lida = lerEscolha(novo);
          if (lida) escolherIdioma(lida);
        }}
      >
        <SelectTrigger
          className="h-8 w-56 text-sm"
          aria-label={t.configuracoes.idioma.titulo}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ESCOLHAS_DE_IDIOMA.map((opcao) => (
            <SelectItem key={opcao} value={opcao} className="text-sm">
              {ROTULOS[opcao]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </section>
  );
}
