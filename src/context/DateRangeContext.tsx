import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DatePreset,
  DateRange,
  getRangeFromPreset,
  validateRange,
  parseRangeFromURL,
  serializeRangeToURL,
  saveRangeToStorage,
  loadRangeFromStorage,
  startOfDay,
  endOfDay,
  toISO,
  toDateOnly,
  toEndExclusive,
} from "@/lib/dateRange";

interface DateRangeContextValue {
  // Current state
  preset: DatePreset;
  start: Date;
  end: Date;
  
  // Formatted values for queries
  startISO: string;
  endISO: string;
  endExclusiveISO: string;
  startDateOnly: string;
  endDateOnly: string;
  
  // Actions
  applyPreset: (preset: DatePreset) => void;
  setCustomRange: (start: Date, end: Date) => void;
  
  // For DateRangePicker component
  setRange: (range: { from: Date | undefined; to: Date | undefined }) => void;
}

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

const DEFAULT_PRESET = DatePreset.LAST_7_DAYS;

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isInitialized, setIsInitialized] = useState(false);
  
  const [preset, setPreset] = useState<DatePreset>(DEFAULT_PRESET);
  const [range, setRangeState] = useState<DateRange>(() => getRangeFromPreset(DEFAULT_PRESET));

  // Initialize from URL or localStorage on mount
  useEffect(() => {
    if (isInitialized) return;

    // Priority 1: URL query string
    const urlRange = parseRangeFromURL(searchParams);
    if (urlRange) {
      setPreset(urlRange.preset);
      if (urlRange.start && urlRange.end) {
        setRangeState({ start: urlRange.start, end: urlRange.end });
      } else {
        setRangeState(getRangeFromPreset(urlRange.preset));
      }
      setIsInitialized(true);
      return;
    }

    // Priority 2: localStorage
    const storedRange = loadRangeFromStorage();
    if (storedRange) {
      setPreset(storedRange.preset);
      if (storedRange.start && storedRange.end) {
        setRangeState({ start: storedRange.start, end: storedRange.end });
      } else {
        setRangeState(getRangeFromPreset(storedRange.preset));
      }
      setIsInitialized(true);
      return;
    }

    // Default
    setIsInitialized(true);
  }, [searchParams, isInitialized]);

  // Sync to URL and localStorage when range changes
  useEffect(() => {
    if (!isInitialized) return;

    // Update URL without navigation
    const newParams = serializeRangeToURL(preset, range.start, range.end);
    const currentParams = new URLSearchParams(searchParams);
    
    // Preserve other params, update range params
    currentParams.delete("range");
    currentParams.delete("from");
    currentParams.delete("to");
    
    newParams.forEach((value, key) => {
      currentParams.set(key, value);
    });
    
    setSearchParams(currentParams, { replace: true });

    // Save to localStorage
    saveRangeToStorage(preset, range.start, range.end);
  }, [preset, range, isInitialized, setSearchParams, searchParams]);

  const applyPreset = useCallback((newPreset: DatePreset) => {
    setPreset(newPreset);
    if (newPreset !== DatePreset.CUSTOM) {
      setRangeState(getRangeFromPreset(newPreset));
    }
  }, []);

  const setCustomRange = useCallback((start: Date, end: Date) => {
    const validated = validateRange(startOfDay(start), endOfDay(end));
    setPreset(DatePreset.CUSTOM);
    setRangeState(validated);
  }, []);

  // For DateRangePicker compatibility
  const setRange = useCallback((rangeInput: { from: Date | undefined; to: Date | undefined }) => {
    if (rangeInput.from && rangeInput.to) {
      setCustomRange(rangeInput.from, rangeInput.to);
    } else if (rangeInput.from) {
      setRangeState(prev => ({
        start: startOfDay(rangeInput.from!),
        end: prev.end,
      }));
    } else if (rangeInput.to) {
      setRangeState(prev => ({
        start: prev.start,
        end: endOfDay(rangeInput.to!),
      }));
    }
  }, [setCustomRange]);

  const value = useMemo<DateRangeContextValue>(() => ({
    preset,
    start: range.start,
    end: range.end,
    startISO: toISO(range.start),
    endISO: toISO(range.end),
    endExclusiveISO: toISO(toEndExclusive(range.end)),
    startDateOnly: toDateOnly(range.start),
    endDateOnly: toDateOnly(range.end),
    applyPreset,
    setCustomRange,
    setRange,
  }), [preset, range, applyPreset, setCustomRange, setRange]);

  return (
    <DateRangeContext.Provider value={value}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange(): DateRangeContextValue {
  const context = useContext(DateRangeContext);
  if (!context) {
    throw new Error("useDateRange must be used within a DateRangeProvider");
  }
  return context;
}
