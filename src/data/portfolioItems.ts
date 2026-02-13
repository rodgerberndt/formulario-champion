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

export const portfolioItems: PortfolioItem[] = [
  {
    id: "1",
    title: "Estático Info",
    thumbnail: "/testimonials/video-1.mp4",
    format: "imagem",
    objective: "lead",
    niche: ["infoprod"],
    description: "Criativo estático de alta conversão para infoproduto.",
  },
  {
    id: "2",
    title: "VSL Nutra",
    thumbnail: "/testimonials/video-2.mp4",
    videoUrl: "/testimonials/video-2.mp4",
    format: "vsl",
    objective: "venda",
    niche: ["nutra"],
    description: "VSL focado em prova social e transformação para nicho Nutra.",
  },
  {
    id: "3",
    title: "Hair Transformation",
    thumbnail: "/testimonials/video-3.mp4",
    videoUrl: "/testimonials/video-3.mp4",
    format: "video",
    objective: "whatsapp",
    niche: ["ecom"],
    description: "Criativo de transformação visual focado em beleza.",
  },
  {
    id: "4",
    title: "Brand Authority",
    thumbnail: "/testimonials/video-4.mp4",
    videoUrl: "/testimonials/video-4.mp4",
    format: "ugc",
    objective: "lead",
    niche: ["servicos"],
    description: "UGC de autoridade de marca para serviços profissionais.",
  },
  {
    id: "5",
    title: "Benefit-Focused Product",
    thumbnail: "/testimonials/video-5.mp4",
    videoUrl: "/testimonials/video-5.mp4",
    format: "reels",
    objective: "venda",
    niche: ["ecom"],
    description: "Reels com foco em benefícios do produto para e-commerce.",
  },
  {
    id: "6",
    title: "Direct Response Sales",
    thumbnail: "/testimonials/video-6.mp4",
    videoUrl: "/testimonials/video-6.mp4",
    format: "video",
    objective: "venda",
    niche: ["nutra"],
    description: "Criativo de resposta direta com hook emocional.",
  },
  {
    id: "7",
    title: "Social Proof Creative",
    thumbnail: "/testimonials/video-7.mp4",
    videoUrl: "/testimonials/video-7.mp4",
    format: "ugc",
    objective: "whatsapp",
    niche: ["infoprod", "servicos"],
    description: "Criativo baseado em prova social para captação via WhatsApp.",
  },
  {
    id: "8",
    title: "High-Conversion Product Ad",
    thumbnail: "/testimonials/video-8.mp4",
    videoUrl: "/testimonials/video-8.mp4",
    format: "vsl",
    objective: "venda",
    niche: ["ecom", "nutra"],
    description: "Ad de alta conversão para produto físico.",
  },
  {
    id: "9",
    title: "Emotional Hook Creative",
    thumbnail: "/testimonials/video-1.mp4",
    videoUrl: "/testimonials/video-1.mp4",
    format: "reels",
    objective: "lead",
    niche: ["infoprod"],
    description: "Reels com gatilho emocional para captura de leads.",
  },
];

export const formatFilters = ["Todos", "Vídeo", "Imagem", "UGC", "VSL", "Reels"] as const;
export const objectiveFilters = ["Todos", "Lead", "WhatsApp", "Venda"] as const;
export const nicheFilters = ["Todos", "Ecom", "Infoprod", "Nutra", "Serviços"] as const;

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
