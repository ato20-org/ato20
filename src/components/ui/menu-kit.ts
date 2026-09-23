import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * As peças de um menu, para quem escreve os itens uma vez e os mostra em dois.
 *
 * O botão direito e os três pontos de uma linha oferecem o MESMO, e são dois
 * componentes diferentes -- menu de contexto e dropdown. Escrever os itens duas
 * vezes é o que faz uma porta ganhar uma ação que a outra não tem, e aí o botão
 * direito passa a parecer uma terceira coisa em vez do atalho que ele é.
 *
 * Quem desenha a linha escreve `itens(kit)` uma vez e passa `KIT_CONTEXTO` ou
 * `KIT_TRES_PONTOS` conforme o menu que está montando.
 *
 * O `as` no kit dos três pontos: as duas famílias saem do mesmo `Menu` do
 * base-ui e recebem as mesmas props, mas o TypeScript as vê como tipos sem
 * relação. A conversão é o preço de não duplicar os itens, e o compilador ainda
 * cobra cada item contra a forma do menu de contexto.
 */
export type Kit = {
  Item: typeof ContextMenuItem;
  Separator: typeof ContextMenuSeparator;
  Sub: typeof ContextMenuSub;
  SubTrigger: typeof ContextMenuSubTrigger;
  SubContent: typeof ContextMenuSubContent;
};

export const KIT_CONTEXTO: Kit = {
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
};

export const KIT_TRES_PONTOS: Kit = {
  Item: DropdownMenuItem as Kit["Item"],
  Separator: DropdownMenuSeparator as Kit["Separator"],
  Sub: DropdownMenuSub as Kit["Sub"],
  SubTrigger: DropdownMenuSubTrigger as Kit["SubTrigger"],
  SubContent: DropdownMenuSubContent as Kit["SubContent"],
};
