export interface PortfolioItem {
  id: string;
  title: string;
  thumbnail: string;
  videoUrl?: string;
  format: "video" | "imagem" | "ugc" | "vsl" | "reels";
  objective: "lead" | "whatsapp" | "venda";
  niche: string[];
  description?: string;
}

const STORAGE = "https://zjbmcxpbdofmlaphozep.supabase.co/storage/v1/object/public/portfolio-videos";

export const portfolioItems: PortfolioItem[] = [
  // Vídeos
  {
    id: "v1",
    title: "Hair Transformation",
    thumbnail: `${STORAGE}/videos/1768674737895-0rj9v.mp4`,
    videoUrl: `${STORAGE}/videos/1768674737895-0rj9v.mp4`,
    format: "video",
    objective: "whatsapp",
    niche: ["ecom"],
    description: "Criativo de transformação visual focado em beleza.",
  },
  {
    id: "v2",
    title: "VSL Nutra",
    thumbnail: `${STORAGE}/videos/1768674267937-6ojpgt.mp4`,
    videoUrl: `${STORAGE}/videos/1768674267937-6ojpgt.mp4`,
    format: "vsl",
    objective: "venda",
    niche: ["nutra"],
    description: "VSL focado em prova social e transformação para nicho Nutra.",
  },
  {
    id: "v3",
    title: "VSL Infoproduto",
    thumbnail: `${STORAGE}/videos/1768674176285-sfzj3n.mp4`,
    videoUrl: `${STORAGE}/videos/1768674176285-sfzj3n.mp4`,
    format: "vsl",
    objective: "venda",
    niche: ["infoprod"],
    description: "VSL de alta conversão para infoproduto.",
  },
  {
    id: "v4",
    title: "Brand Authority",
    thumbnail: `${STORAGE}/videos/1768574088072-y6bc0e.mp4`,
    videoUrl: `${STORAGE}/videos/1768574088072-y6bc0e.mp4`,
    format: "ugc",
    objective: "lead",
    niche: ["nutra"],
    description: "UGC de autoridade de marca para nicho Nutra.",
  },
  {
    id: "v5",
    title: "Benefit-Focused Product",
    thumbnail: `${STORAGE}/videos/1768574080824-3q0gcv.mp4`,
    videoUrl: `${STORAGE}/videos/1768574080824-3q0gcv.mp4`,
    format: "video",
    objective: "venda",
    niche: ["servicos"],
    description: "Criativo com foco em benefícios do produto para serviços.",
  },
  {
    id: "v6",
    title: "Transformation Visual",
    thumbnail: `${STORAGE}/videos/1768574061131-mglbw.mp4`,
    videoUrl: `${STORAGE}/videos/1768574061131-mglbw.mp4`,
    format: "video",
    objective: "whatsapp",
    niche: ["servicos"],
    description: "Criativo de transformação visual para serviços.",
  },
  {
    id: "v7",
    title: "Direct Response Sales",
    thumbnail: `${STORAGE}/videos/1768574032985-tdrrq.mp4`,
    videoUrl: `${STORAGE}/videos/1768574032985-tdrrq.mp4`,
    format: "video",
    objective: "venda",
    niche: ["infoprod"],
    description: "Criativo de resposta direta com hook emocional.",
  },
  {
    id: "v8",
    title: "Social Proof",
    thumbnail: `${STORAGE}/videos/1768574012961-b2liq6.mp4`,
    videoUrl: `${STORAGE}/videos/1768574012961-b2liq6.mp4`,
    format: "ugc",
    objective: "whatsapp",
    niche: ["nutra"],
    description: "Criativo baseado em prova social para captação via WhatsApp.",
  },
  {
    id: "v9",
    title: "Emotional Hook",
    thumbnail: `${STORAGE}/videos/1768573995441-xuo05.mp4`,
    videoUrl: `${STORAGE}/videos/1768573995441-xuo05.mp4`,
    format: "reels",
    objective: "lead",
    niche: ["dropshipping"],
    description: "Reels com gatilho emocional para captura de leads.",
  },
  {
    id: "v10",
    title: "Problem-Solution Product",
    thumbnail: `${STORAGE}/videos/1768573980912-c9jm3se.mp4`,
    videoUrl: `${STORAGE}/videos/1768573980912-c9jm3se.mp4`,
    format: "video",
    objective: "venda",
    niche: ["dropshipping"],
    description: "Criativo problema-solução para dropshipping.",
  },
  {
    id: "v11",
    title: "High-Conversion Product Ad",
    thumbnail: `${STORAGE}/videos/1768573964692-9q8yuk.mp4`,
    videoUrl: `${STORAGE}/videos/1768573964692-9q8yuk.mp4`,
    format: "video",
    objective: "venda",
    niche: ["dropshipping"],
    description: "Ad de alta conversão para produto físico.",
  },
  {
    id: "v12",
    title: "Direct Response Hook",
    thumbnail: `${STORAGE}/videos/1768573948422-8rgvbp.mp4`,
    videoUrl: `${STORAGE}/videos/1768573948422-8rgvbp.mp4`,
    format: "video",
    objective: "venda",
    niche: ["nutra"],
    description: "Criativo de resposta direta com hook forte.",
  },
  {
    id: "v13",
    title: "Shock Story Hook",
    thumbnail: `${STORAGE}/videos/1768572783998-cac2l.mp4`,
    videoUrl: `${STORAGE}/videos/1768572783998-cac2l.mp4`,
    format: "reels",
    objective: "lead",
    niche: ["nutra"],
    description: "Reels com gancho de história impactante.",
  },
];

export const formatFilters = ["Todos", "Vídeo", "Imagem", "UGC", "VSL", "Reels"] as const;
export const objectiveFilters = ["Todos", "Lead", "WhatsApp", "Venda"] as const;
export const nicheFilters = ["Todos", "Ecom", "Infoprod", "Nutra", "Serviços", "Dropshipping"] as const;

export function filterPortfolio(
  items: PortfolioItem[],
  format: string,
  objective: string,
  niche: string,
  search: string
) {
  return items.filter((item) => {
    const matchFormat = format === "Todos" || item.format === format.toLowerCase();
    const matchObjective = objective === "Todos" || item.objective === objective.toLowerCase();
    const matchNiche = niche === "Todos" || item.niche.some(n => n === niche.toLowerCase().replace("ç", "c"));
    const matchSearch = !search || item.title.toLowerCase().includes(search.toLowerCase()) || item.description?.toLowerCase().includes(search.toLowerCase());
    return matchFormat && matchObjective && matchNiche && matchSearch;
  });
}
