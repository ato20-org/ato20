"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Copy, ExternalLink, Globe, Mail } from "lucide-react";
import { toast } from "sonner";

import logo from "@/assets/logo-white.png";
import {
  MarcaGithub,
  MarcaInstagram,
  MarcaKofi,
  MarcaX,
} from "@/components/marcas";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n/desktop";
import {
  EMAIL_DO_ATO20,
  INSTAGRAM_DO_ATO20,
  KOFI_DO_ATO20,
  REPOSITORIO_DO_ATO20,
  SITE_DO_ATO20,
  X_DO_AUTOR,
  enderecoCurto,
} from "@/lib/projeto";
import { versaoAtual } from "@/lib/versoes";

/**
 * Quem fez, onde fica e como falar: a seção Sobre das Configurações.
 *
 * Os endereços à vista, e não só o nome da rede: quem procura o contato quer
 * saber para onde vai antes de clicar, e quem não tem conta naquela rede ainda
 * pode copiar o endereço. A linha inteira é o alvo, e abre no navegador do
 * sistema.
 *
 * O e-mail tem o botão de copiar ao lado porque o `mailto:` depende de um
 * cliente de e-mail instalado, e no Linux muita máquina não tem nenhum.
 */
export function Sobre() {
  const versao = versaoAtual();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <Image src={logo} alt="" aria-hidden className="h-9 w-auto" />
        <div>
          <p className="text-base font-semibold tracking-[0.2em]">ATO20</p>
          {versao ? (
            <p className="text-muted-foreground text-xs tabular-nums">
              {versao.versao}
            </p>
          ) : null}
        </div>
      </header>

      <p className="text-sm leading-relaxed">{t.configuracoes.sobre.saudacao}</p>

      <Grupo titulo={t.configuracoes.sobre.projeto}>
        <Linha
          icone={<Globe />}
          rotulo={t.configuracoes.sobre.site}
          url={`${SITE_DO_ATO20}/`}
        />
        <Linha
          icone={<MarcaGithub />}
          rotulo={t.configuracoes.sobre.codigo}
          url={REPOSITORIO_DO_ATO20}
        />
      </Grupo>

      <Grupo titulo={t.configuracoes.sobre.contato}>
        <Linha
          icone={<Mail />}
          rotulo={t.configuracoes.sobre.email}
          url={`mailto:${EMAIL_DO_ATO20}`}
          valor={EMAIL_DO_ATO20}
          acessorio={<CopiarEmail />}
        />
        <Linha
          icone={<MarcaX />}
          rotulo={t.configuracoes.sobre.x}
          url={X_DO_AUTOR}
        />
        <Linha
          icone={<MarcaInstagram />}
          rotulo={t.configuracoes.sobre.instagram}
          url={INSTAGRAM_DO_ATO20}
        />
      </Grupo>

      <Grupo titulo={t.configuracoes.sobre.apoiar}>
        <Linha
          icone={<MarcaKofi />}
          rotulo={t.configuracoes.sobre.kofi}
          url={KOFI_DO_ATO20}
        />
      </Grupo>
    </div>
  );
}

/** Um grupo de links, com o título miúdo das seções de Teclado e Plugins. */
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <p className="text-muted-foreground px-1.5 text-[10px] font-medium uppercase">
        {titulo}
      </p>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

/** Um link: ícone, nome e o endereço, e a linha inteira abre. */
function Linha({
  icone,
  rotulo,
  url,
  valor,
  acessorio,
}: {
  icone: ReactNode;
  rotulo: string;
  url: string;
  /** O que se lê no lugar do endereço. Sem ele, o próprio endereço, curto. */
  valor?: string;
  /** Um botão a mais na ponta da linha, fora do alvo do link. */
  acessorio?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={() =>
          void openUrl(url).catch(() =>
            toast.error(t.configuracoes.sobre.semNavegador),
          )
        }
        className="hover:bg-muted/50 focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-3 rounded-md px-1.5 py-1.5 text-left transition-colors outline-none focus-visible:ring-3"
      >
        <span className="text-muted-foreground grid size-4 shrink-0 place-items-center [&_svg]:size-4">
          {icone}
        </span>
        <span className="w-20 shrink-0 text-sm">{rotulo}</span>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
          {valor ?? enderecoCurto(url)}
        </span>
        <ExternalLink
          className="text-muted-foreground size-3.5 shrink-0"
          aria-hidden
        />
      </button>
      {acessorio}
    </li>
  );
}

function CopiarEmail() {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground size-7 shrink-0"
      aria-label={t.configuracoes.sobre.copiarEmail}
      title={t.configuracoes.sobre.copiarEmail}
      onClick={() =>
        void navigator.clipboard
          .writeText(EMAIL_DO_ATO20)
          .then(() => toast.success(t.configuracoes.sobre.emailCopiado))
          .catch(() => {})
      }
    >
      <Copy className="size-3.5" />
    </Button>
  );
}
