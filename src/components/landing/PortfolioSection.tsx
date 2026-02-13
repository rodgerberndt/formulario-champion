import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Play, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReveal } from "@/hooks/useReveal";
import {
  portfolioItems,
  filterPortfolio,
  formatFilters,
  objectiveFilters,
  nicheFilters,
  type PortfolioItem,
} from "@/data/portfolioItems";

export function PortfolioSection() {
  const { ref, isVisible } = useReveal(0.08);
  const [format, setFormat] = useState("Todos");
  const [objective, setObjective] = useState("Todos");
  const [niche, setNiche] = useState("Todos");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<PortfolioItem | null>(null);

  const filtered = filterPortfolio(portfolioItems, format, objective, niche, search);

  const scrollToCTA = () => {
    document.querySelector("#cta-final")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="portfolio" className="py-16 md:py-24 relative" ref={ref}>
      <div className="container mx-auto px-5 max-w-6xl">
        <div className={`text-center mb-10 reveal-up ${isVisible ? "visible" : ""}`}>
          <h2 className="text-foreground mb-3">
            PORTFÓLIO <span className="gold-text">DE ADS</span>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Alguns dos ads que a Champion usa pra validar e escalar.
          </p>
        </div>

        {/* Filters */}
        <div className={`flex flex-wrap gap-3 justify-center mb-8 reveal-up ${isVisible ? "visible" : ""}`} style={{ transitionDelay: "200ms" }}>
          <FilterRow label="Formato" options={[...formatFilters]} value={format} onChange={setFormat} />
          <FilterRow label="Objetivo" options={[...objectiveFilters]} value={objective} onChange={setObjective} />
          <FilterRow label="Nicho" options={[...nicheFilters]} value={niche} onChange={setNiche} />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs rounded-lg bg-muted/30 border border-border/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring w-36"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence mode="popLayout">
            {filtered.map((item, i) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                className="gold-card group cursor-pointer overflow-hidden p-0"
                onClick={() => setSelectedItem(item)}
              >
                <div className="aspect-[9/12] relative overflow-hidden rounded-t-2xl bg-muted/20">
                  <video
                    src={item.thumbnail}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    playsInline
                    autoPlay
                    preload="metadata"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 flex gap-1.5 flex-wrap">
                    {item.niche.map((n) => (
                      <span key={n} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary/15 text-secondary border border-secondary/20 capitalize">
                        {n}
                      </span>
                    ))}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent-foreground border border-accent/20 capitalize">
                      {item.format}
                    </span>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-14 h-14 rounded-full bg-secondary/90 flex items-center justify-center shadow-lg">
                      <Play className="w-6 h-6 text-secondary-foreground ml-0.5" />
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-bold text-foreground mb-1" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    {item.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground mt-8">Nenhum criativo encontrado com os filtros selecionados.</p>
        )}

        {/* Full portfolio link */}
        <div className="text-center mt-10">
          <a
            href="https://portfoliochampion.lovable.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-secondary hover:text-secondary/80 font-semibold transition-colors"
          >
            Ver portfólio completo <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {selectedItem && (
          <AdViewerModal item={selectedItem} onClose={() => setSelectedItem(null)} onCTA={scrollToCTA} />
        )}
      </AnimatePresence>
    </section>
  );
}

function FilterRow({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`text-xs px-2.5 py-1 rounded-lg transition-all ${
            value === opt
              ? "bg-secondary/15 text-secondary border border-secondary/30 font-semibold"
              : "text-muted-foreground hover:text-foreground border border-transparent"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function AdViewerModal({ item, onClose, onCTA }: { item: PortfolioItem; onClose: () => void; onCTA: () => void }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative bg-card border border-border/60 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-muted/50 hover:bg-muted text-foreground">
          <X className="w-4 h-4" />
        </button>

        {item.videoUrl && (
          <div className="aspect-[9/16] max-h-[50vh] bg-black rounded-t-2xl overflow-hidden">
            <video src={item.videoUrl} className="w-full h-full object-contain" controls autoPlay playsInline muted />
          </div>
        )}

        <div className="p-6">
          <h3 className="text-xl font-bold text-foreground mb-2" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
            {item.title}
          </h3>
          <div className="flex gap-2 mb-3 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/10 text-secondary capitalize">{item.objective}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent-foreground capitalize">{item.format}</span>
            {item.niche.map((n) => (
              <span key={n} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{n}</span>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mb-5">{item.description}</p>
          <Button
            onClick={() => { onClose(); onCTA(); }}
            className="w-full btn-shine bg-secondary text-secondary-foreground hover:bg-secondary/90 font-bold rounded-xl"
          >
            Quero algo assim no meu negócio
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
