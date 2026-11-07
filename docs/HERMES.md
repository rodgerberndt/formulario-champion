# HERMES — o agente de tráfego

Hermes vigia uma pasta. Todo criativo novo que cai lá vira anúncio no Meta com copy escrita na hora: texto principal, título e descrição, uma variação por anúncio, cada uma com um ângulo diferente. Os anúncios nascem **pausados** até você aprovar.

O nome é do mensageiro dos deuses, que também era o deus do comércio. É o que ele faz: pega o que o time produziu e entrega no lugar certo.

## Estado em 19/08/2026

| item | situação |
|---|---|
| Tabelas e bucket `hermes-criativos` | no ar |
| Function `hermes` | deployada, `verify_jwt = false` |
| Secrets `META_MARKETING_TOKEN`, `HERMES_KEY`, `HERMES_NOTIFY_PHONE` | setados |
| Config da conta `act_1965417164121284` | gravada, modo `fixo` na campanha **CA 03 - Leads - Ads Novos Caio**, conjunto `Ads`, `auto_activate: false` |
| Cron `hermes-run` | ativo, a cada 10 minutos (jobid 2) |
| **App do Meta em modo de desenvolvimento** | **bloqueia a criação do anúncio** (erro `1885183`), veja abaixo |
| `ANTHROPIC_API_KEY` | pendente, mas contornável: copy escrita à mão no `.txt` dispensa o modelo |

**Testado em produção em 19/08:** bucket, ingestão, leitura do ângulo pelo nome, URL assinada, upload de imagem no Meta (hash devolvido), leitura da copy manual do `.txt` e gravação das variações. Tudo isso passa. A criação do creative falha, e por um motivo que não é código.

### O bloqueio do app em modo de desenvolvimento

```
code 100 · subcode 1885183
"O post do criativo dos anúncios foi criado por um app que está em modo de
 desenvolvimento. Ele deve estar em modo público para criar este anúncio."
```

O token vem do app **"APP pro Champions League"** (`1256906429745765`), que está em modo de desenvolvimento. Um app assim lê tudo, mas não pode publicar o post que dá origem ao criativo.

Correção: developers.facebook.com → esse app → alternar de **Desenvolvimento** para **Ao vivo** no topo do painel. Se o botão estiver travado, o app costuma estar pedindo política de privacidade, categoria ou o ícone.

Enquanto a chave da Anthropic não estiver setada, não coloque criativo no bucket: cada tick vai falhar e gastar as três tentativas do arquivo.

### Por que o destino não é a campanha de headlines

A config nasceu apontada para a campanha **TESTE AB (Headlines)** em modo `duplicar`, e eu tirei de lá. Aquele teste é um experimento controlado em curso desde 14/08: cinco conjuntos com orçamento ABO travado e igual, **os mesmos quatro criativos validados dentro de cada um**, exatamente para isolar o efeito da headline. Um HD5 com criativo que não existe nos outros conjuntos quebraria essa premissa bem no meio da apuração, com R$1.226 investidos, 8 MQL e uma venda de R$9.250 já rastreados.

Então o Hermes entra na campanha **CA 03 - Leads - Ads Novos Caio**, conjunto `Ads` (R$12/dia, otimizando MQL), que existe justamente para criativo novo, e aponta para `/HD3`, a headline que está vendendo. É o mesmo lugar onde os "Caio Case" já entram hoje.

Quando o teste eleger a vencedora (a régua combinada é ~20 MQL), vale voltar para o modo `duplicar` e deixar o Hermes testar headline nova. Basta um `?action=config` com `adset_mode: "duplicar"`, `template_adset_id` e `default_campaign_id`.

---

## O que ele faz, em ordem

1. **Ingestão.** Lista o bucket `hermes-criativos` e registra todo arquivo que ainda não conhece.
2. **Copy.** Chama o Claude Opus 5 com o Conceito do Ouriço, a régua de MQL da casa e as copies que já estão rodando com melhor CPC na conta. Devolve N variações, cada uma atacando um ângulo distinto.
3. **Mídia.** Sobe o vídeo (por signed URL, o Meta baixa direto) ou a imagem (base64), espera a transcodificação e pega a thumbnail.
4. **Anúncios.** Um anúncio por variação de copy, dentro do conjunto de destino, com `standard_enhancements` em **OPT_OUT**.
5. **Aviso.** Manda no seu WhatsApp a lista de títulos que subiram.
6. **Aprovação.** Você chama `?action=approve` e os anúncios vão para ACTIVE.

### Os dois modos de destino

A casa já testa headline de um jeito específico: na campanha **"CA 03 - Leads - Ads validados + TESTE AB (Headlines)"**, a headline é a variável do **conjunto** (HD1 a HD4, R$10/dia cada, link `/HD1` a `/HD4`), e os mesmos criativos se repetem dentro de cada um. O Hermes respeita isso.

**`adset_mode: "duplicar"`** (é o que espelha a operação de hoje). Cada headline gerada vira um conjunto novo, clonado do conjunto-modelo:

```
CAMPANHA: CA 03 - Leads - TESTE AB (Headlines)
├── HD5  (clone do HD1: mesmo público, pixel MQL, R$10/dia)   link /HD5
│    └── anúncio com o criativo novo + headline 5
├── HD6                                                        link /HD6
│    └── anúncio com o criativo novo + headline 6
└── HD7                                                        link /HD7
     └── anúncio com o criativo novo + headline 7
```

O clone vem de `POST /{adset_id}/copies`, e não de um conjunto montado do zero, porque público, pixel, evento de otimização, orçamento e estratégia de lance são decisões que vocês já tomaram no modelo. Montar por parâmetro significaria eu adivinhar cada uma, e público errado só aparece depois da verba gasta. O número do slot é o próximo livre na campanha: com HD1 a HD4 lá, o Hermes começa no HD5.

**`adset_mode: "fixo"`.** Todos os anúncios caem num conjunto único, um por variação de copy. Mais barato de maturar, útil para um teste rápido de ângulo, mas o CPMQL sai por anúncio com headline e texto misturados, sem separar o efeito de um do outro.

Em nenhum dos dois eu uso `asset_feed_spec` com várias headlines num anúncio só: ali o Meta não separa métrica por headline, e o teste perde o sentido.

### Por que OPT_OUT nas melhorias automáticas

A auditoria de criativos já apurou que `creative_features_spec` com `enroll_status: OPT_IN` é uma das quatro causas de vídeo ser entregue como imagem estática. Além disso, um teste de copy exige criativo idêntico entre as variações, e melhoria automática recorta e traduz por conta própria.

### Como ele se conecta ao funil que já existe

O nome de cada anúncio termina em `utm_content=hermes-{angulo}-v{n}`, e a `url_tags` carrega o mesmo valor. O `meta-ads-cron` extrai `utm_content=` do nome do anúncio para montar a `creative_key`, então todo anúncio do Hermes aparece no funil de CPMQL sem nenhuma alteração no que já roda.

---

## Setup, uma vez só

### Passo 0 — liberar a conta que está rodando (pendente em 18/08/2026)

O token "API Hub" (system user `122120866533349836`, app "APP pro Champions League") tem todos os escopos certos: `ads_management`, `ads_read`, `business_management`, `pages_read_engagement`, `pages_manage_ads`, e não expira.

O problema é outro. Ele **não está atribuído** à `act_1965417164121284`, que é justamente a conta que está gastando hoje. Ele consegue ler a conta, mas `user_tasks` volta vazio e ela nem aparece em `/me/adaccounts`. A única pessoa atribuída lá é a Lovani Maria Weller Berndt.

Onde ele escreve hoje:

| conta | moeda | status | escrita | observação |
|---|---|---|---|---|
| `act_1965417164121284` CA 03 - BMsss | — | ACTIVE | **não** | é onde o dinheiro roda; falta atribuir |
| `act_1107952820265255` CA03 BM NOVA | BRL | 3, fatura em aberto | sim | R$128 mil de histórico, 6 conjuntos ativos |
| `act_1733204057869041` CA 02 - BMsss | USD | ACTIVE | sim | R$338 em 30 dias, nenhum conjunto ativo |
| `act_4571654849820572` CA 03 - BMsss | USD | 3, fatura em aberto | sim | zero gasto |

O ajuste: business.facebook.com → BM **jordanjerome2622** (`321327204212799`) → Contas de anúncios → **CA 03 - BMsss** → Adicionar pessoas → usuário do sistema **API Hub** → **Controle total**.

### Passo 1 — o token (feito)

O `META_ACCESS_TOKEN` que já existe serve para **ler** insights. Criar anúncio exige o escopo `ads_management`, que é outro nível de permissão, e nenhum token de leitura pode ser promovido sozinho. Este passo é seu, dentro da BM.

Recomendado, porque não expira junto com a sua sessão:

1. business.facebook.com → **Configurações do negócio** → **Usuários** → **Usuários do sistema**
2. **Adicionar** → nome `hermes` → função **Administrador**
3. **Adicionar ativos** → marque a conta de anúncios e a página → dê acesso **total**
4. **Gerar novo token** → escolha o app → marque `ads_management`, `ads_read`, `business_management`, `pages_read_engagement`, `pages_manage_ads`
5. Copie o token. Ele não aparece de novo.

Repita para cada BM que o Hermes vai atender. Um usuário de sistema por BM.

### Passo 2 — os secrets

```bash
cd 01-Projetos/formulario-champion
npx supabase secrets set META_MARKETING_TOKEN='<o token do passo 1>'
npx supabase secrets set ANTHROPIC_API_KEY='<chave da Anthropic>'
npx supabase secrets set HERMES_KEY='<invente uma senha longa>'
npx supabase secrets set HERMES_NOTIFY_PHONE='55<seu whatsapp com ddd>'
```

`META_MARKETING_TOKEN` é separado do `META_ACCESS_TOKEN` de propósito: se ele vazar, quem pega escreve na conta, e não só lê. Se estiver ausente, o Hermes cai no token de leitura e vai falhar no primeiro `POST` com erro de permissão, que é o comportamento certo.

### Passo 3 — subir tabelas e função

```bash
npx supabase db push
npx supabase functions deploy hermes
```

### Passo 4 — descobrir os IDs

```bash
# BMs, contas e páginas que o token enxerga
curl -s -H "x-hermes-key: $HERMES_KEY" \
  "https://qzzyfohzoxiefwbmtclt.supabase.co/functions/v1/hermes?action=setup"

# conjuntos de uma conta específica
curl -s -H "x-hermes-key: $HERMES_KEY" \
  "https://qzzyfohzoxiefwbmtclt.supabase.co/functions/v1/hermes?action=setup&ad_account_id=act_XXXXXXXX"
```

Se `action=setup` já falhar aqui, o token do passo 1 não tem o escopo certo. Não adianta seguir.

### Passo 5 — gravar a config

Levantado em 18/08/2026 com o token "API Hub", já preenchido com os IDs reais:

```bash
curl -s -X POST -H "x-hermes-key: $HERMES_KEY" -H "Content-Type: application/json" \
  "https://qzzyfohzoxiefwbmtclt.supabase.co/functions/v1/hermes?action=config" \
  -d '{
    "label": "CA 03 - teste de headlines",
    "ad_account_id": "act_1965417164121284",
    "page_id": "516497034872440",
    "instagram_actor_id": "17841460233329014",
    "adset_mode": "duplicar",
    "default_campaign_id": "52596173251893",
    "template_adset_id": "52596227183493",
    "adset_name_pattern": "HD{n}",
    "link_url": "https://www.championadstudio.com/{slot}",
    "cta_type": "SEE_DETAILS",
    "copies_per_creative": 3,
    "auto_activate": false
  }'
```

| campo | valor | de onde veio |
|---|---|---|
| `ad_account_id` | `act_1965417164121284` | a conta que está gastando hoje, status ACTIVE |
| `page_id` | `516497034872440` | Champion Ad Studio |
| `instagram_actor_id` | `17841460233329014` | @assessoriachampion |
| `default_campaign_id` | `52596173251893` | CA 03 - Leads - Ads validados + TESTE AB (Headlines) |
| `template_adset_id` | `52596227183493` | HD1: R$10/dia, lance mais baixo sem limite, otimizando o evento MQL do pixel 2171667863227042, BR 18 a 65 |
| `cta_type` | `SEE_DETAILS` | é o CTA dos anúncios que já rodam nesse conjunto |

O `{slot}` no `link_url` é trocado pelo nome do conjunto na hora, então o HD5 aponta para `championadstudio.com/HD5`. **A página de cada slot novo precisa existir no site**, senão o clique cai em 404. Se preferir mandar todos para um destino só, tire o `{slot}` e ponha a URL fixa.

Uma config por conta de anúncios. O `?action=config` confirma que o token escreve naquela conta antes de gravar, então um erro aqui é problema de permissão, não de digitação.

Deixe `auto_activate` em `false` nas primeiras semanas. Vire para `true` só quando você tiver olhado uma dezena de copies e concordado com o padrão.

### Passo 6 — o cron

No painel do Supabase, **Integrations → Cron → Create job**:

- nome: `hermes-run`
- agenda: `*/10 * * * *`
- tipo: **Supabase Edge Function**, método POST, função `hermes`, com `?action=run`
- header: `x-hermes-key: <o mesmo HERMES_KEY>`

Ou por SQL, se preferir versionar:

```sql
select cron.schedule(
  'hermes-run', '*/10 * * * *',
  $$ select net.http_post(
       url := 'https://qzzyfohzoxiefwbmtclt.supabase.co/functions/v1/hermes?action=run',
       headers := '{"Content-Type":"application/json","x-hermes-key":"<HERMES_KEY>"}'::jsonb
     ) $$
);
```

Dez minutos é de propósito. Cada tick processa **um** criativo, porque upload de vídeo, transcodificação e geração de copy juntos consomem o teto de tempo da edge function. Cinco criativos novos entram no ar em menos de uma hora, e nenhum tick morre no meio.

---

## O dia a dia

### Subir criativo

Jogue o arquivo no bucket `hermes-criativos` (Storage no painel, ou pela API). Formatos aceitos: `mp4`, `mov`, `m4v`, `webm`, `jpg`, `jpeg`, `png`, `webp`.

**A convenção do nome importa**, porque é dela que sai o ângulo que orienta a copy:

```
dor-de-agencia__v3-final.mp4     ->  ângulo: "dor de agencia"
prova-social-caio.mp4            ->  ângulo: "prova social caio"
```

Para dar mais contexto, suba um `.txt` de mesmo nome ao lado:

```
dor-de-agencia__v3-final.mp4
dor-de-agencia__v3-final.txt     ->  vira o briefing no prompt
```

O `.txt` é onde vale escrever o que o vídeo mostra, qual objeção ele ataca e o que não pode ser dito. Quanto mais específico, menos genérica a copy.

### Escrever a copy à mão

Quando você já sabe o que quer dizer, escreva no mesmo `.txt` neste formato e o Hermes usa exatamente isso, sem passar pelo modelo:

```
[1]
titulo: Sua operação trava onde exatamente?
texto: Você já faz tudo certo, e mesmo assim o teto não sobe.

Não é falta de esforço, é a copy que não acompanha o produto.
descricao: Para quem fatura 10k+

[2]
titulo: 3 milhões em um mês
texto: O Arthur não trocou de produto, trocou o que dizia sobre ele.
descricao: Case real
```

Um bloco por anúncio. Aceita `título`, `headline`, `texto`, `descrição` em qualquer caixa e ordem, e o texto pode ter várias linhas. Bloco sem título ou sem texto é ignorado. Se o `.txt` for texto corrido, volta a ser briefing e o modelo escreve.

Isso também é a saída enquanto a `ANTHROPIC_API_KEY` não estiver configurada.

### Ver a fila

```bash
curl -s -H "x-hermes-key: $HERMES_KEY" \
  "https://qzzyfohzoxiefwbmtclt.supabase.co/functions/v1/hermes?action=status"
```

Devolve a fila, as copies geradas com seus `meta_ad_id`, e o log passo a passo.

### Aprovar

**Pelo WhatsApp.** A mensagem que o Hermes manda já traz dois links, "Aprovar" e "Descartar". Cada link é assinado só para aquele criativo e aquela ação, então ele não carrega a `HERMES_KEY` junto: quem interceptar a mensagem aprova aquele criativo e nada além dele.

Clicar abre uma página de confirmação com um botão. A ação só roda no clique, nunca na abertura, porque o WhatsApp busca todo link sozinho para montar a pré-visualização, e um GET que executasse aprovaria tudo no instante em que a mensagem chega.

**Por linha de comando**, quando quiser aprovar uma variação isolada:

```bash
# todas as variações do criativo
curl -s -H "x-hermes-key: $HERMES_KEY" \
  "https://.../hermes?action=approve&creative_id=<uuid>"

# uma variação só
curl -s -H "x-hermes-key: $HERMES_KEY" \
  "https://.../hermes?action=approve&copy_id=<uuid>"
```

### Rejeitar

```bash
curl -s -H "x-hermes-key: $HERMES_KEY" \
  "https://.../hermes?action=reject&creative_id=<uuid>"
```

Rejeitar deixa o anúncio pausado no Meta em vez de apagar. O histórico de entrega some junto com o anúncio, e uma copy rejeitada hoje às vezes é a que você quer reler no mês que vem.

---

## Estados

| status do criativo | o que significa |
|---|---|
| `pendente` | na fila, ainda não processado (ou aguardando nova tentativa) |
| `processando` | tick atual está com ele |
| `no_ar` | anúncios criados e pausados, esperando aprovação (no modo duplicar, o conjunto clonado também nasce pausado, e aprovar liga os dois) |
| `ativo` | anúncios aprovados e rodando |
| `erro` | falhou 3 vezes, precisa de olho humano |
| `ignorado` | rejeitado |

Falha não perde trabalho: o `meta_video_id`, a thumbnail e as copies já geradas ficam salvos, e a próxima tentativa continua de onde parou em vez de pagar upload e geração de novo. Após 3 tentativas ele desiste e te avisa no WhatsApp.

---

## Regras que estão embutidas na copy

Ficam no `system` de [copy.ts](../supabase/functions/hermes/copy.ts) e valem para toda variação gerada:

- **Nunca travessão.** Vírgula, ponto, dois-pontos ou quebra de linha no lugar.
- **O alvo é MQL**, lead com faturamento declarado de 10 mil para cima. Escrever para filtrar, não para volume.
- **O Ouriço** entra inteiro: braço de copy autossuficiente, do anúncio ao checkout, mudança de patamar no trimestre, e o que a Champion não faz.
- **Nada de linguagem de guru** e nenhuma promessa de número que a gente não pode provar.
- **Ângulos distintos entre variações.** Duas variações que dizem o mesmo com palavras trocadas não são um teste.
- Limites do Meta aplicados no código, cortando sem partir palavra: 600 / 40 / 30 caracteres.

Para mudar qualquer uma dessas regras, mexa no `SYSTEM` de `copy.ts` e faça `functions deploy hermes` de novo.

---

## Limites conhecidos

- **Posicionamento e público vêm do conjunto**, não do anúncio. Se o conjunto de destino estiver com posicionamento automático, o vídeo pode ser entregue como imagem em coluna da direita, Marketplace e busca. Isso é configuração do conjunto e o Hermes não mexe nela de propósito, porque mexer significaria alterar o que já está rodando.
- **Um destino por conta.** Para mandar um criativo específico para outro conjunto no modo fixo, preencha `adset_id` na linha da tabela `hermes_creatives` antes do tick.
- **Não cria campanha.** Conjunto ele cria, mas só clonando um modelo que você apontou, nunca montando um do zero: orçamento, público e lance continuam saindo de uma decisão sua.
- **A página do slot precisa existir.** No modo duplicar com `{slot}` no link, o HD5 aponta para uma URL que o site tem que servir.
- **Não desliga anúncio ruim.** Hermes sobe; matar criativo que não performa continua sendo decisão humana com base no CPMQL.
