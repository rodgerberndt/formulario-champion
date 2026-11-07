/**
 * Cases de Sucesso da landing (seção `success_cases`, âncora #resultados).
 *
 * Copy literal de docs/cases-de-sucesso-copy-2026-09-17.md. NÃO reescrever
 * nome ou bio do case. Os dados de `perfis` foram transcritos dos prints do
 * Instagram que o Rodger colou no chat em 17/09/2026: também são literais
 * (inclusive "começe").
 *
 * Mídia: coloque os arquivos em `public/cases/<slug>/` e preencha o caminho
 * público (começando com "/cases/..."). Campo vazio = versão sem arquivo.
 *   perfis[].print  → print do perfil do Instagram (png/webp). Quando existe,
 *                     substitui o cartão de perfil desenhado em código.
 *                     ex.: "/cases/luis-e-nathan/instagram-tebulozo.png"
 *   perfis[].avatar → foto de perfil (quadrada). Sem ela, o cartão usa a logo
 *                     do case (se houver) ou as iniciais.
 *   vturb  → id do player Vturb (ConverteAI) do depoimento. Vence o `video`.
 *   video  → depoimento (mp4 H.264, vertical). Só carrega ao clicar. Quando
 *            existir, aparece ACIMA dos perfis (vídeo e perfil juntos).
 *   poster → frame de capa do vídeo (jpg/webp). Sem ele, usa `foto`.
 *   foto   → foto dos clientes; hoje só serve de capa reserva do vídeo.
 *   logo   → logo da marca (só a Nulle tem), fundo transparente.
 */

export type FormatoMidia = "9:16" | "4:5";

export interface PerfilInstagram {
  /** Usuário sem "@". Vira link para instagram.com/<user>. */
  user: string;
  /** Nome exibido no perfil. */
  nome: string;
  verificado: boolean;
  posts: string;
  seguidores: string;
  seguindo: string;
  /** Categoria do perfil (ex.: "Empreendedor(a)"). */
  categoria?: string;
  /** Bio, uma string por linha. */
  bio: string[];
  /** Link da bio, sem "https://". */
  link?: string;
  /** Print do perfil. Preenchido = mostra a imagem no lugar do cartão. */
  print: string;
  /** Foto de perfil. */
  avatar: string;
}

export interface CaseSucesso {
  slug: string;
  /** Nomes como vieram na copy. */
  nomes: string;
  /** Nome da empresa. Vazio quando a copy diz que não tem. */
  empresa?: string;
  /** Perfis do Instagram do case, na ordem em que aparecem. */
  perfis: PerfilInstagram[];
  /** Destaque numérico tirado da própria bio. */
  destaque: { valor: string; rotulo: string };
  /** Bio literal. */
  bio: string;
  foto: string;
  logo: string;
  video: string;
  /** Player Vturb (ConverteAI): só o id. Tem prioridade sobre `video`. */
  vturb?: string;
  poster: string;
  /** Proporção nativa do vídeo. */
  formato: FormatoMidia;
}

export const CASES_SUCESSO: CaseSucesso[] = [
  {
    slug: "luis-e-nathan",
    nomes: "Luis e Nathan",
    perfis: [
      {
        user: "tebulozo",
        nome: "tebulozo",
        verificado: true,
        posts: "18",
        seguidores: "3.397",
        seguindo: "84",
        categoria: "Empreendedor(a)",
        bio: ["+7d do zero com white", "Te ensino a escalar 6d/mes", "Vendendo em dólar e euro", "Clica e começe agora"],
        link: "tebulozo.com",
        print: "", // ex.: "/cases/luis-e-nathan/instagram-tebulozo.png"
        avatar: "/cases/luis-e-nathan/avatar-tebulozo.webp",
      },
      {
        user: "iamluuishr",
        nome: "Luis",
        verificado: false,
        posts: "4",
        seguidores: "18 mil",
        seguindo: "1.725",
        bio: ["mg BR | nj us", "Joshua 1:9"],
        print: "", // ex.: "/cases/luis-e-nathan/instagram-iamluuishr.png"
        avatar: "/cases/luis-e-nathan/avatar-iamluuishr.webp",
      },
    ],
    destaque: { valor: "94k", rotulo: "primeiro mês com a gente" },
    bio: "Infoprodutores low ticket na gringa, +7D faturados, primeiro mês com a gente = 94k de faturamento",
    foto: "",
    logo: "",
    video: "", // ex.: "/cases/luis-e-nathan/depoimento.mp4"
    vturb: "6aac3790d1a5582ed94a466a",
    poster: "",
    formato: "9:16",
  },
  {
    slug: "nulle",
    nomes: "Artur e Alexandre",
    empresa: "Nulle",
    perfis: [
      {
        user: "nulleoficial",
        nome: "nulle®",
        verificado: true,
        posts: "160",
        seguidores: "8.980",
        seguindo: "5",
        bio: ["A forma mais fácil e rápida de regular o cortisol", "Clique aqui"],
        link: "linktr.ee/nulleoficial",
        print: "", // ex.: "/cases/nulle/instagram-nulleoficial.png"
        avatar: "/cases/nulle/avatar-nulleoficial.webp",
      },
    ],
    destaque: { valor: "80k → 200k", rotulo: "mês, em 30 dias" },
    bio: "Esses 2 monstros já faturavam com constância quando iniciaram com a gente, porém, escala travada, nutra no Brasil. Em 30 dias, saímos de 80k mês, e batemos 200k mês.",
    foto: "",
    logo: "", // ex.: "/cases/nulle/logo.svg"
    video: "", // ex.: "/cases/nulle/depoimento.mp4"
    vturb: "6aac3736291afa23d679cfad",
    poster: "",
    formato: "9:16",
  },
  {
    slug: "ighor-lopes",
    nomes: "Ighor Lopes",
    perfis: [
      {
        user: "ighorbl",
        nome: "Ighor Lopes",
        verificado: false,
        posts: "6",
        seguidores: "630",
        seguindo: "664",
        bio: ["Gyn"],
        print: "", // ex.: "/cases/ighor-lopes/instagram-ighorbl.png"
        avatar: "/cases/ighor-lopes/avatar-ighorbl.webp",
      },
    ],
    destaque: { valor: "6 dígitos", rotulo: "múltiplos, mês" },
    bio: "Ighor era mais um daqueles que já estava vivendo bem, mas, sabia que a criação de criativos estava afetando o seu potencial máximo, Ecommerce no Brasil - múltiplos 6 dígitos mês",
    foto: "",
    logo: "",
    video: "", // ex.: "/cases/ighor-lopes/depoimento.mp4"
    vturb: "6aac373c0975baa8023159e1",
    poster: "",
    formato: "9:16",
  },
  {
    slug: "arthur-costa",
    nomes: "Arthur Costa",
    perfis: [
      {
        user: "arthurgc_04",
        nome: "Arthur Costa",
        verificado: false,
        posts: "4",
        seguidores: "373",
        seguindo: "799",
        bio: [],
        print: "", // ex.: "/cases/arthur-costa/instagram-arthurgc_04.png"
        avatar: "/cases/arthur-costa/avatar-arthurgc_04.webp",
      },
    ],
    destaque: { valor: "+250k", rotulo: "em pouco mais de 1 mês" },
    bio: "Arthur chegou na gente dizendo que não tinha mais tempo de fazer criativo, e decidiu largar na nossa mão, Resultado? +250k de faturamento em pouco mais de 1 mês.",
    foto: "",
    logo: "",
    video: "", // ex.: "/cases/arthur-costa/depoimento.mp4"
    vturb: "6aac37a2864f0040d3d88218",
    poster: "",
    formato: "9:16",
  },
  {
    // Case novo (29/09/2026). Perfil transcrito do print que o Rodger deixou
    // em G:\downloads (Screenshot_106.jpg). A situação de entrada vem da call
    // de venda de 16/07/2026 (squads/copy-criativo-champion/data/calls/
    // call-casitas.txt): ele fazia criativo, copy e página sozinho e testava
    // 5 por semana querendo 10. O RESULTADO ainda não existe em lugar nenhum
    // do vault (não há call de resultado do Casitas), então o destaque e o
    // fim da bio estão marcados para o Rodger preencher. Chute derruba o case.
    slug: "lojas-casitas",
    nomes: "Fernando Nunes",
    // Sem o nome da empresa, a pedido do Rodger (29/09/2026): "não pode
    // aparecer". O slug fica, é só identificador interno.
    perfis: [
      {
        user: "fernanddo_nuns",
        nome: "Fernando Nunes",
        verificado: false,
        posts: "2",
        seguidores: "733",
        seguindo: "1050",
        bio: ["São Luiss"],
        print: "",
        avatar: "/cases/lojas-casitas/avatar-fernanddo_nuns.webp",
      },
    ],
    // Resultado passado pelo Rodger em 29/09/2026: de 30k para 50k por mês em
    // 2 meses. O "5 por semana, queria pelo menos 10" é literal da call
    // (fala 38): "uma média até que baixa de testes criativos, uns 5 por
    // semana. Queria testar pelo menos uns 10."
    // Texto final ditado pelo Rodger em 29/09/2026 (o "5x mais" é decisão
    // dele; a call diz 10 + 5 de teste). Dólar explícito, também pedido dele.
    destaque: { valor: "US$ 30k → 50k", rotulo: "por mês, em 2 meses" },
    bio: "Fernando fazia tudo sozinho, e testava 5 criativos por semana quando PRECISAVA de 5x mais. Drop no Brasil. Largou o criativo na nossa mão e, em 2 meses, foi de US$ 30k para US$ 50k por mês.",
    foto: "",
    logo: "",
    video: "",
    poster: "",
    formato: "9:16",
  },
];
