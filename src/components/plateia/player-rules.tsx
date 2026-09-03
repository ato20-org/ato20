"use client";

import { useEffect, useState } from "react";
import { BookOpen, ExternalLink, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { remoteAssetUrl } from "@/lib/supabase/asset-sync";
import { loadRules, type RuleLink } from "@/lib/supabase/rooms";

/**
 * Material de regras publicado pelo mestre.
 *
 * PDF enviado abre em aba nova em vez do visualizador interno: aqui não há
 * URL assinada para gerenciar — o bucket `assets` é público e a URL é
 * calculável — e o leitor nativo de PDF do celular é melhor que um `iframe`.
 */
export function PlayerRules({ roomId }: { roomId: string }) {
  const [rules, setRules] = useState<RuleLink[] | null>(null);

  useEffect(() => {
    let active = true;

    void loadRules(roomId).then(
      (list) => {
        if (active) setRules(list);
      },
      () => {
        if (active) setRules([]);
      },
    );

    return () => {
      active = false;
    };
  }, [roomId]);

  if (rules === null) {
    return <Loader2 className="text-muted-foreground mx-auto size-4 animate-spin" />;
  }

  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <BookOpen className="text-muted-foreground size-7" aria-hidden />
        <p className="text-muted-foreground text-xs">
          O mestre ainda não publicou material de regras.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rules.map((rule) => {
        const href = rule.url ?? (rule.assetId ? remoteAssetUrl(roomId, rule.assetId) : null);
        if (!href) return null;

        return (
          <li key={rule.id}>
            <Button
              render={<a href={href} target="_blank" rel="noopener" />}
              nativeButton={false}
              variant="outline"
              className="h-auto w-full justify-start py-2"
            >
              {rule.assetId ? <FileText /> : <ExternalLink />}
              <span className="min-w-0 flex-1 truncate text-left">{rule.label}</span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
