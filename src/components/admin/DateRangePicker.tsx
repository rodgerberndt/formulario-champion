import { useState, useMemo } from "react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

type DateRange = {
  from: Date | undefined;
  to: Date | undefined;
};

interface DateRangePickerProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

const PRESET_OPTIONS = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "today_yesterday", label: "Hoje e ontem" },
  { value: "last_7", label: "Últimos 7 dias" },
  { value: "last_14", label: "Últimos 14 dias" },
  { value: "last_28", label: "Últimos 28 dias" },
  { value: "last_30", label: "Últimos 30 dias" },
  { value: "this_week", label: "Esta semana" },
  { value: "last_week", label: "Semana passada" },
  { value: "this_month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
  { value: "maximum", label: "Máximo" },
  { value: "custom", label: "Personalizado" },
];

function getPresetDateRange(preset: string): DateRange {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  
  switch (preset) {
    case "today":
      return { from: new Date(today.setHours(0, 0, 0, 0)), to: new Date() };
    case "yesterday": {
      const yesterday = subDays(new Date(), 1);
      yesterday.setHours(0, 0, 0, 0);
      const yesterdayEnd = subDays(new Date(), 1);
      yesterdayEnd.setHours(23, 59, 59, 999);
      return { from: yesterday, to: yesterdayEnd };
    }
    case "today_yesterday": {
      const yesterday = subDays(new Date(), 1);
      yesterday.setHours(0, 0, 0, 0);
      return { from: yesterday, to: new Date() };
    }
    case "last_7":
      return { from: subDays(new Date(), 6), to: new Date() };
    case "last_14":
      return { from: subDays(new Date(), 13), to: new Date() };
    case "last_28":
      return { from: subDays(new Date(), 27), to: new Date() };
    case "last_30":
      return { from: subDays(new Date(), 29), to: new Date() };
    case "this_week":
      return { from: startOfWeek(new Date(), { weekStartsOn: 0 }), to: new Date() };
    case "last_week": {
      const lastWeek = subWeeks(new Date(), 1);
      return { from: startOfWeek(lastWeek, { weekStartsOn: 0 }), to: endOfWeek(lastWeek, { weekStartsOn: 0 }) };
    }
    case "this_month":
      return { from: startOfMonth(new Date()), to: new Date() };
    case "last_month": {
      const lastMonth = subMonths(new Date(), 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    }
    case "maximum":
      return { from: new Date(2020, 0, 1), to: new Date() };
    default:
      return { from: undefined, to: undefined };
  }
}

export default function DateRangePicker({ dateRange, onDateRangeChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>("last_30");
  const [showCalendar, setShowCalendar] = useState(false);

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    if (preset === "custom") {
      setShowCalendar(true);
    } else {
      setShowCalendar(false);
      const range = getPresetDateRange(preset);
      onDateRangeChange(range);
      setIsOpen(false);
    }
  };

  const handleCalendarSelect = (range: DateRange | undefined) => {
    if (range) {
      onDateRangeChange(range);
    }
  };

  const clearFromDate = () => {
    onDateRangeChange({ from: undefined, to: dateRange.to });
  };

  const clearToDate = () => {
    onDateRangeChange({ from: dateRange.from, to: undefined });
  };

  const formatDisplayDate = (date: Date | undefined) => {
    if (!date) return "dd/mm/aaaa";
    return format(date, "dd/MM/yyyy", { locale: ptBR });
  };

  const presetLabel = useMemo(() => {
    const preset = PRESET_OPTIONS.find(p => p.value === selectedPreset);
    return preset?.label || "Selecionar período";
  }, [selectedPreset]);

  return (
    <div className="flex items-center gap-2">
      {/* Main Preset Selector */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-start text-left font-normal gap-2",
              !dateRange.from && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="h-4 w-4" />
            <span>{presetLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="start">
          <div className="flex gap-6">
            {/* Preset Options */}
            <RadioGroup
              value={selectedPreset}
              onValueChange={handlePresetChange}
              className="flex flex-col gap-2"
            >
              {PRESET_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={option.value} id={option.value} />
                  <Label
                    htmlFor={option.value}
                    className="text-sm cursor-pointer"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            {/* Calendar for custom selection */}
            {showCalendar && (
              <div className="border-l pl-4">
                <Calendar
                  mode="range"
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={handleCalendarSelect}
                  numberOfMonths={2}
                  locale={ptBR}
                  className="pointer-events-auto"
                />
                <div className="flex justify-end mt-4">
                  <Button
                    size="sm"
                    onClick={() => setIsOpen(false)}
                    disabled={!dateRange.from || !dateRange.to}
                  >
                    Aplicar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Date From Input */}
      <div className="flex items-center gap-1 px-3 py-2 bg-background border border-input rounded-md">
        <span className="text-sm text-muted-foreground">{formatDisplayDate(dateRange.from)}</span>
        {dateRange.from && (
          <button
            onClick={clearFromDate}
            className="p-0.5 hover:bg-muted rounded"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      <span className="text-sm text-muted-foreground">até</span>

      {/* Date To Input */}
      <div className="flex items-center gap-1 px-3 py-2 bg-background border border-input rounded-md">
        <span className="text-sm text-muted-foreground">{formatDisplayDate(dateRange.to)}</span>
        {dateRange.to && (
          <button
            onClick={clearToDate}
            className="p-0.5 hover:bg-muted rounded"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}
