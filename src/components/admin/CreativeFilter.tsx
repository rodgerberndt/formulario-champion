import { Film } from "lucide-react";

export const ALL_CREATIVES = "all";

export interface CreativeOption {
  content: string;
  sessions: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  creatives: CreativeOption[];
}

/**
 * Filtro global de criativo, par do filtro de página.
 *
 * O teste de headline só é válido com UMA variável mudando. Como a página
 * original recebe criativos que as variantes não recebem, comparar sem travar o
 * criativo mede criativo + headline ao mesmo tempo. Travando aqui, a única
 * diferença entre as páginas volta a ser a headline.
 *
 * Os valores seguem o que o backend entende: `all`, `group:<prefixo>` (todas as
 * variações de um criativo, ex. "- V3" e "- C1") ou `one:<utm_content>`.
 */
export default function CreativeFilter({ value, onChange, creatives }: Props) {
  // Agrupa "Luis-Nathan Case #2 - V3" e "- C1" sob "Luis-Nathan Case #2".
  const groups = new Map<string, CreativeOption[]>();
  creatives.forEach((c) => {
    const base = c.content.includes(" - ") ? c.content.split(" - ")[0].trim() : c.content;
    const list = groups.get(base) || [];
    list.push(c);
    groups.set(base, list);
  });

  const totalSessions = creatives.reduce((sum, c) => sum + c.sessions, 0);

  return (
    <div className="flex items-center gap-2">
      <Film className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-border/50 bg-background px-2 text-[11px] text-foreground max-w-[16rem] focus:outline-none focus:ring-1 focus:ring-primary/40"
      >
        <option value={ALL_CREATIVES}>Todos os criativos ({totalSessions})</option>
        {Array.from(groups.entries()).map(([base, items]) => {
          const groupSessions = items.reduce((sum, c) => sum + c.sessions, 0);
          // Criativo com uma variação só não vira grupo: viraria duas linhas
          // idênticas no seletor.
          if (items.length === 1) {
            return (
              <option key={`one:${items[0].content}`} value={`one:${items[0].content}`}>
                {items[0].content} ({items[0].sessions})
              </option>
            );
          }
          return (
            <optgroup key={base} label={base}>
              <option value={`group:${base}`}>
                {base} — todas as {items.length} versões ({groupSessions})
              </option>
              {items.map((c) => (
                <option key={`one:${c.content}`} value={`one:${c.content}`}>
                  {c.content} ({c.sessions})
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </div>
  );
}
