import { useState, useMemo } from "react";
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
import { ptBR } from "date-fns/locale";
import { useDateRange } from "@/context/DateRangeContext";
import {
  DatePreset,
  PRESET_LABELS,
  formatDisplayDate,
  startOfDay,
  endOfDay,
} from "@/lib/dateRange";

const PRESET_OPTIONS: Array<{ value: DatePreset; label: string }> = [
  { value: DatePreset.TODAY, label: PRESET_LABELS[DatePreset.TODAY] },
  { value: DatePreset.YESTERDAY, label: PRESET_LABELS[DatePreset.YESTERDAY] },
  { value: DatePreset.TODAY_YESTERDAY, label: PRESET_LABELS[DatePreset.TODAY_YESTERDAY] },
  { value: DatePreset.LAST_7_DAYS, label: PRESET_LABELS[DatePreset.LAST_7_DAYS] },
  { value: DatePreset.LAST_14_DAYS, label: PRESET_LABELS[DatePreset.LAST_14_DAYS] },
  { value: DatePreset.LAST_28_DAYS, label: PRESET_LABELS[DatePreset.LAST_28_DAYS] },
  { value: DatePreset.LAST_30_DAYS, label: PRESET_LABELS[DatePreset.LAST_30_DAYS] },
  { value: DatePreset.THIS_WEEK, label: PRESET_LABELS[DatePreset.THIS_WEEK] },
  { value: DatePreset.LAST_WEEK, label: PRESET_LABELS[DatePreset.LAST_WEEK] },
  { value: DatePreset.THIS_MONTH, label: PRESET_LABELS[DatePreset.THIS_MONTH] },
  { value: DatePreset.LAST_MONTH, label: PRESET_LABELS[DatePreset.LAST_MONTH] },
  { value: DatePreset.MAXIMUM, label: PRESET_LABELS[DatePreset.MAXIMUM] },
  { value: DatePreset.CUSTOM, label: PRESET_LABELS[DatePreset.CUSTOM] },
];

export default function UniversalDateRangePicker() {
  const { preset, start, end, applyPreset, setCustomRange, setRange } = useDateRange();
  const [isOpen, setIsOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(preset === DatePreset.CUSTOM);

  // Local state for calendar selection
  const [calendarRange, setCalendarRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: start,
    to: end,
  });

  const handlePresetChange = (newPreset: string) => {
    const presetValue = newPreset as DatePreset;
    if (presetValue === DatePreset.CUSTOM) {
      setShowCalendar(true);
      setCalendarRange({ from: start, to: end });
    } else {
      setShowCalendar(false);
      applyPreset(presetValue);
      setIsOpen(false);
    }
  };

  const handleCalendarSelect = (range: { from: Date | undefined; to: Date | undefined } | undefined) => {
    if (range) {
      setCalendarRange(range);
    }
  };

  const applyCustomRange = () => {
    if (calendarRange.from && calendarRange.to) {
      setCustomRange(calendarRange.from, calendarRange.to);
      setIsOpen(false);
    }
  };

  const clearFromDate = () => {
    setRange({ from: undefined, to: end });
  };

  const clearToDate = () => {
    setRange({ from: start, to: undefined });
  };

  const presetLabel = useMemo(() => {
    return PRESET_LABELS[preset] || "Selecionar período";
  }, [preset]);

  return (
    <div className="flex items-center gap-2">
      {/* Main Preset Selector */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-start text-left font-normal gap-2",
              !start && "text-muted-foreground"
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
              value={preset}
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
                  selected={{ from: calendarRange.from, to: calendarRange.to }}
                  onSelect={handleCalendarSelect}
                  numberOfMonths={2}
                  locale={ptBR}
                  className="pointer-events-auto"
                />
                <div className="flex justify-end mt-4">
                  <Button
                    size="sm"
                    onClick={applyCustomRange}
                    disabled={!calendarRange.from || !calendarRange.to}
                  >
                    Aplicar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Date From Display */}
      <div className="flex items-center gap-1 px-3 py-2 bg-background border border-input rounded-md">
        <span className="text-sm text-muted-foreground">{formatDisplayDate(start)}</span>
        {start && preset === DatePreset.CUSTOM && (
          <button
            onClick={clearFromDate}
            className="p-0.5 hover:bg-muted rounded"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      <span className="text-sm text-muted-foreground">até</span>

      {/* Date To Display */}
      <div className="flex items-center gap-1 px-3 py-2 bg-background border border-input rounded-md">
        <span className="text-sm text-muted-foreground">{formatDisplayDate(end)}</span>
        {end && preset === DatePreset.CUSTOM && (
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
