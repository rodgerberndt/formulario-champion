export interface PortfolioItem {
  id: string;
  title: string;
  youtubeId: string;
  format: "video" | "imagem" | "ugc" | "vsl" | "reels";
  objective: "lead" | "whatsapp" | "venda";
  niche: string[];
  description?: string;
}

export const portfolioItems: PortfolioItem[] = [
  {
    id: "yt1",
    title: "Criativo 1",
    youtubeId: "EJNnHoNBmTc",
    format: "video",
    objective: "venda",
    niche: ["ecom"],
  },
  {
    id: "yt2",
    title: "Criativo 2",
    youtubeId: "W0rigJTvCAo",
    format: "video",
    objective: "whatsapp",
    niche: ["nutra"],
  },
  {
    id: "yt3",
    title: "Criativo 3",
    youtubeId: "aKHHLIcPqDM",
    format: "vsl",
    objective: "venda",
    niche: ["infoprod"],
  },
  {
    id: "yt4",
    title: "Criativo 4",
    youtubeId: "Ga0HlT60YnY",
    format: "ugc",
    objective: "lead",
    niche: ["nutra"],
  },
  {
    id: "yt5",
    title: "Criativo 5",
    youtubeId: "zjdVVPurgos",
    format: "video",
    objective: "venda",
    niche: ["servicos"],
  },
  {
    id: "yt6",
    title: "Criativo 6",
    youtubeId: "WzFHtRt2Zug",
    format: "reels",
    objective: "whatsapp",
    niche: ["dropshipping"],
  },
  {
    id: "yt7",
    title: "Criativo 7",
    youtubeId: "NVniIcKJtpM",
    format: "video",
    objective: "venda",
    niche: ["nutra"],
  },
  {
    id: "yt8",
    title: "Criativo 8",
    youtubeId: "dxZiyX8CUYQ",
    format: "ugc",
    objective: "lead",
    niche: ["ecom"],
  },
  {
    id: "yt9",
    title: "Criativo 9",
    youtubeId: "VLHXNreqZdw",
    format: "reels",
    objective: "venda",
    niche: ["infoprod"],
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
