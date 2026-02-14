import { useRef, useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";

/**
 * ShimmerText — headline with a gold shimmer reflection sweeping across on reveal.
 * Wraps children in a span with the shimmer CSS animation.
 */
export function ShimmerText({
  children,
  isVisible,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  isVisible: boolean;
  className?: string;
  delay?: number;
}) {
  return (
    <span
      className={`inline-block ${className}`}
      style={{
        animationDelay: `${delay}ms`,
      }}
    >
      <span className={`shimmer-text-effect ${isVisible ? "active" : ""}`} style={{ animationDelay: `${delay + 300}ms` }}>
        {children}
      </span>
    </span>
  );
}

/**
 * WordCascade — words appear one-by-one from below with stagger.
 */
export function WordCascade({
  text,
  isVisible,
  className = "",
  stagger = 50,
  baseDelay = 0,
}: {
  text: string;
  isVisible: boolean;
  className?: string;
  stagger?: number;
  baseDelay?: number;
}) {
  const words = useMemo(() => text.split(" "), [text]);

  return (
    <span className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          className="inline-block mr-[0.3em]"
          initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
          animate={isVisible ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
          transition={{
            delay: (baseDelay + i * stagger) / 1000,
            duration: 0.45,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

/**
 * KeywordGlow — a keyword with gold stroke + glow effect.
 */
export function KeywordGlow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`keyword-glow ${className}`}>
      {children}
    </span>
  );
}

/**
 * LineReveal — paragraph text that reveals line-by-line with a subtle blur.
 */
export function LineReveal({
  children,
  isVisible,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  isVisible: boolean;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10, filter: "blur(3px)" }}
      animate={isVisible ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
      transition={{
        delay: delay / 1000,
        duration: 0.55,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
