import { HEADLINE_VARIANTS } from "@/config/headlineVariants";
import { Layers } from "lucide-react";

export const ALL_PAGES = "all";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Filtro global de página de entrada (teste de headline).
 *
 * Fica ao lado do filtro de datas e vale pro admin inteiro: funil do site,
 * funil do quiz por etapa, análise semanal e comportamento da landing passam a
 * falar só das sessões que entraram por aquela página. "Todas" soma tudo.
 */
export default function PageVariantFilter({ value, onChange }: Props) {
  const options = [{ path: ALL_PAGES, label: "Todas as páginas" }, ...HEADLINE_VARIANTS];

  return (
    <div className="flex items-center gap-2">
      <Layers className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = value === opt.path;
          return (
            <button
              key={opt.path}
              onClick={() => onChange(opt.path)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                active
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-transparent border-border/50 text-muted-foreground hover:border-border"
              }`}
              title={opt.path === ALL_PAGES ? "Soma a original com todas as variantes" : opt.path}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
