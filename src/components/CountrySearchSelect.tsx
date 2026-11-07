import { useMemo, useState } from "react";
import { getCountryCallingCode, type Country } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import { ChevronDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface Option {
  value?: Country;
  label: string;
  divider?: boolean;
}

/**
 * Seletor de país do PhoneField com busca.
 *
 * Substitui o <select> nativo da react-phone-number-input, que com ~250 países
 * obrigava a rolar até achar. Busca pelo nome em português, pelo código
 * (+55 ou 55) e pela sigla (BR). Recebe as props do `countrySelectComponent`.
 */
export function CountrySearchSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value?: Country;
  onChange: (value?: Country) => void;
  options: Option[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Brasil e os países mais comuns da base primeiro; o resto em ordem alfabética.
  const itens = useMemo(() => {
    const topo: Country[] = ["BR", "PT", "US"];
    const validos = options.filter((o): o is Option & { value: Country } => Boolean(o.value));
    const primeiros = topo
      .map((c) => validos.find((o) => o.value === c))
      .filter(Boolean) as (Option & { value: Country })[];
    const resto = validos
      .filter((o) => !topo.includes(o.value))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    return [...primeiros, ...resto].map((o) => ({
      ...o,
      ddi: getCountryCallingCode(o.value),
    }));
  }, [options]);

  const Flag = value ? flags[value] : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Escolher país"
          className="PhoneInputCountry country-search-trigger"
        >
          <span className="PhoneInputCountryIcon">
            {Flag ? <Flag title={value} /> : null}
          </span>
          <ChevronDown className="w-3.5 h-3.5 opacity-70" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const q = search
              .toLowerCase()
              .normalize("NFD")
              .replace(/[̀-ͯ]/g, "")
              .replace(/^\+/, "")
              .trim();
            return itemValue.includes(q) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Buscar país ou código (+55)" />
          <CommandList className="max-h-64">
            <CommandEmpty>Nenhum país encontrado.</CommandEmpty>
            <CommandGroup>
              {itens.map((o) => {
                const ItemFlag = flags[o.value];
                const chave = `${o.label} ${o.value} ${o.ddi}`
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[̀-ͯ]/g, "");
                return (
                  <CommandItem
                    key={o.value}
                    value={chave}
                    onSelect={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <span className="w-5 h-3.5 shrink-0 overflow-hidden rounded-[2px]">
                      {ItemFlag ? <ItemFlag title={o.label} /> : null}
                    </span>
                    <span className="flex-1 truncate">{o.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">+{o.ddi}</span>
                    <Check
                      className={cn("w-4 h-4", value === o.value ? "opacity-100" : "opacity-0")}
                      aria-hidden
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
