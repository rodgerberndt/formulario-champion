import { useState } from "react";
import { Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

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
 * Filtro global de criativo, par do filtro de página e no mesmo padrão visual
 * do seletor de datas.
 *
 * O teste de headline só é válido com UMA variável mudando. Como a página
 * original recebe criativos que as variantes não recebem, comparar sem travar o
 * criativo mede criativo + headline ao mesmo tempo.
 *
 * Os valores seguem o que o backend entende: `all`, `group:<prefixo>` (todas as
 * versões de um criativo, ex. "- V3" e "- C1") ou `one:<utm_content>`.
 */
export default function CreativeFilter({ value, onChange, creatives }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  // Agrupa "Luis-Nathan Case #2 - V3" e "- C1" sob "Luis-Nathan Case #2".
  const groups = new Map<string, CreativeOption[]>();
  creatives.forEach((c) => {
    const base = c.content.includes(" - ") ? c.content.split(" - ")[0].trim() : c.content;
    const list = groups.get(base) || [];
    list.push(c);
    groups.set(base, list);
  });

  const totalSessions = creatives.reduce((sum, c) => sum + c.sessions, 0);

  const options: { value: string; label: string; sessions: number; indent?: boolean }[] = [
    { value: ALL_CREATIVES, label: "Todos os criativos", sessions: totalSessions },
  ];
  Array.from(groups.entries()).forEach(([base, items]) => {
    const groupSessions = items.reduce((sum, c) => sum + c.sessions, 0);
    // Criativo com uma versão só não vira grupo: viraria duas linhas idênticas.
    if (items.length === 1) {
      options.push({ value: `one:${items[0].content}`, label: items[0].content, sessions: items[0].sessions });
      return;
    }
    options.push({ value: `group:${base}`, label: `${base} · todas as ${items.length} versões`, sessions: groupSessions });
    items.forEach((c) => options.push({ value: `one:${c.content}`, label: c.content, sessions: c.sessions, indent: true }));
  });

  const selected = options.find((o) => o.value === value);

  const handleChange = (next: string) => {
    onChange(next);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start text-left font-normal gap-2 max-w-[18rem]">
          <Film className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">{selected?.label ?? "Todos os criativos"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-4 max-h-[26rem] overflow-y-auto" align="start">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Criativo
        </p>
        {creatives.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum criativo com sessões no período selecionado.
          </p>
        ) : (
          <RadioGroup value={value} onValueChange={handleChange} className="flex flex-col gap-2.5">
            {options.map((option) => (
              <div
                key={option.value}
                className={`flex items-center space-x-2 ${option.indent ? "pl-5" : ""}`}
              >
                <RadioGroupItem value={option.value} id={`crv-${option.value}`} />
                <Label
                  htmlFor={`crv-${option.value}`}
                  className="text-sm cursor-pointer flex items-baseline gap-1.5 leading-tight"
                >
                  <span className={option.indent ? "text-muted-foreground" : ""}>{option.label}</span>
                  <span className="text-[10px] text-muted-foreground/70">({option.sessions})</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}
      </PopoverContent>
    </Popover>
  );
}
