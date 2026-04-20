import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  /** Number of decimal places */
  decimals?: number;
  /** Suffix appended after value (e.g. "%") */
  suffix?: string;
  /** Prefix prepended before value (e.g. "-") */
  prefix?: string;
  /** Animation duration in ms */
  duration?: number;
  /** Format function — overrides decimals/suffix/prefix when provided */
  format?: (n: number) => string;
  className?: string;
  /** Class added briefly when value changes (default pulse highlight) */
  pulseClassName?: string;
}

/**
 * Smoothly tweens a numeric value from its previous value to the new value.
 * Adds a brief CSS pulse class when the value changes so the user can perceive updates.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = "",
  prefix = "",
  duration = 700,
  format,
  className = "",
  pulseClassName = "animate-pulse-once",
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const [pulsing, setPulsing] = useState(false);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const pulseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    // Trigger pulse highlight
    setPulsing(true);
    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => setPulsing(false), 800);

    let startTs: number | null = null;
    const step = (ts: number) => {
      if (startTs === null) startTs = ts;
      const progress = Math.min((ts - startTs) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  useEffect(() => () => {
    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
  }, []);

  const text = format
    ? format(display)
    : `${prefix}${display.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`;

  return (
    <span className={`${className} ${pulsing ? pulseClassName : ""} transition-colors`}>
      {text}
    </span>
  );
}
