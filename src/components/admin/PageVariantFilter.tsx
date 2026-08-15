import { useState } from "react";
import { Layers, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { HEADLINE_VARIANTS } from "@/config/headlineVariants";

export const ALL_PAGES = "all";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Filtro global de página de entrada (teste de headline).
 *
 * Segue o mesmo padrão do seletor de datas: um botão que abre um popover com as
 * opções. Era uma fileira de botões sempre visível, que ocupava a largura toda
 * do header e ficava pior a cada variante nova.
 *
 * Vale pro admin inteiro: funil do site, funil do quiz, análise semanal e
 * comportamento da landing passam a considerar só as sessões que entraram por
 * aquela página.
 */
export default function PageVariantFilter({ value, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const options = [
    { path: ALL_PAGES, label: "Todas as páginas", hint: "Soma a original com todas as variantes" },
    ...HEADLINE_VARIANTS.map((v) => ({
      path: v.path,
      label: v.label,
      hint: `${v.lead}${v.highlight ?? ""}`.trim(),
    })),
  ];

  const selected = options.find((o) => o.path === value) ?? options[0];

  const handleChange = (next: string) => {
    onChange(next);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start text-left font-normal gap-2">
          <Layers className="h-4 w-4" />
          <span>{selected.label}</span>
          {value !== ALL_PAGES && (
            <span className="font-mono text-[10px] text-muted-foreground">{value}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Página de entrada
        </p>
        <RadioGroup value={value} onValueChange={handleChange} className="flex flex-col gap-2.5">
          {options.map((option) => (
            <div key={option.path} className="flex items-start space-x-2">
              <RadioGroupItem value={option.path} id={`page-${option.path}`} className="mt-0.5" />
              <Label htmlFor={`page-${option.path}`} className="cursor-pointer leading-tight">
                <span className="text-sm flex items-center gap-1.5">
                  {option.label}
                  {option.path === value && <Check className="h-3 w-3 text-primary" />}
                </span>
                {/* A headline em si é o que identifica a variante de verdade;
                    o rótulo sozinho ("HD2") não diz nada depois de uns dias. */}
                <span className="block text-[11px] text-muted-foreground font-normal mt-0.5 line-clamp-2">
                  {option.hint}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </PopoverContent>
    </Popover>
  );
}
