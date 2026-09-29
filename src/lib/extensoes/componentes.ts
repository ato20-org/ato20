"use client";

import { ConfirmarRemocao } from "@/components/mestre/confirmar-remocao";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { SeletorDeCor } from "@/components/mestre/seletor-de-cor";
import { DadoParado } from "@/components/playground/dado-parado";
import { DesenhoDoMedidor } from "@/components/playground/desenho-do-medidor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { NumberField } from "@/components/ui/number-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Os componentes que um plugin desenha com.
 *
 * O pedido era que a interface de um plugin parecesse a do aplicativo -- os
 * mesmos botões, campos, chaves e menus --, e a única forma de isso valer é
 * entregar os mesmos componentes: um plugin que trouxesse a própria biblioteca
 * de UI teria outra fonte, outro raio de borda e outro foco, e o tema da
 * campanha não o alcançaria.
 *
 * Dois grupos, e a linha entre eles é o COMPROMISSO:
 *
 * `COMPONENTES` é promessa. O que está aqui tem as props que tem hoje pelo
 * tempo que a API 2 existir, e trocar uma prop pede versão nova. Por isso a
 * lista é curta e feita do que todo formulário usa -- botão, campo, número,
 * chave, seleção, deslizador, abas, diálogo, menu, dica -- mais os desenhos que
 * são deste projeto e que um plugin não conseguiria refazer igual: o seletor de
 * cor, o medidor, o dado, a confirmação de remoção, o painel vazio.
 *
 * `EXPERIMENTAL` está lá, funciona, e pode mudar sem aviso. É o que existe no
 * app mas cujas props ainda se mexem, ou que depende de moldura que o plugin
 * não controla (o menu de contexto precisa de um gatilho que é do palco).
 *
 * Tudo isto o Mestre já carrega para si. Expor não custa byte nenhum, e o
 * objeto é montado só quando um plugin ativa -- ver `construirApi`.
 */
export const COMPONENTES = Object.freeze({
  Button,
  Input,
  NumberField,
  Textarea,
  Label,
  Switch,
  Slider,
  Separator,
  Kbd,
  ScrollArea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  SeletorDeCor,
  DesenhoDoMedidor,
  DadoParado,
  ConfirmarRemocao,
  PainelVazio,
});

export const EXPERIMENTAL = Object.freeze({
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
});

export type Componentes = typeof COMPONENTES;
export type Experimental = typeof EXPERIMENTAL;
