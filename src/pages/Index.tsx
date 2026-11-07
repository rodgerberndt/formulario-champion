import { useCallback, useEffect, useState } from "react";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { Hero } from "@/components/landing/Hero";
import { CasesSucesso } from "@/components/landing/CasesSucesso";
import { PainSection } from "@/components/landing/PainSection";

import { VturbCreatives } from "@/components/landing/VturbCreatives";
import { MetodoChampion } from "@/components/landing/MetodoChampion";
import { ClientFeedbacks } from "@/components/landing/ClientFeedbacks";

import { HowItWorks } from "@/components/landing/HowItWorks";
import { FAQSection } from "@/components/landing/FAQSection";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";
import { Botao } from "@/components/landing/Botao";
import { MotionConfig } from "framer-motion";
import type { Json } from "@/integrations/supabase/types";
import { useTracking } from "@/hooks/useTracking";
import { useUtmCapture } from "@/hooks/useUtmCapture";
import { useSmoothScroll } from "@/hooks/useSmoothScroll";
import { useSectionThemes } from "@/hooks/useSectionThemes";
import { useLandingTracking } from "@/hooks/useLandingTracking";
import { useLandingHit } from "@/hooks/useLandingHit";
import { HEADLINE_VARIANTS, type HeadlineVariant } from "@/config/headlineVariants";
import { type SubheadlineVariant } from "@/config/subheadlineVariants";
import { NichoContext, COPY_POR_NICHO, type Nicho } from "@/config/nichoLanding";
import { GarantiaSection } from "@/components/landing/GarantiaSection";
import { QuemAtende } from "@/components/landing/QuemAtende";
import { FORMULARIO_TOPO_ID, rolarAteFormulario } from "@/lib/formularioTopo";

interface IndexProps {
  /** Variante de headline. Ausente = página original ("/"). */
  variant?: HeadlineVariant;
  /** Variante de subheadline (teste SH). A headline fica travada na vencedora. */
  subheadline?: SubheadlineVariant;
  /**
   * Mercado com quem a página fala. Muda só o TEXTO das seções (ver
   * `nichoLanding.ts`); a estrutura, a ordem e o tracking são os mesmos em
   * todos os nichos. Ausente = "geral", a copy que já estava no ar.
   */
  nicho?: Nicho;
}

const Index = ({ variant, subheadline, nicho = "geral" }: IndexProps) => {
  const { trackEvent } = useTracking();
  const headline = variant ?? HEADLINE_VARIANTS[0];
  const copy = COPY_POR_NICHO[nicho];
  useUtmCapture();
  useSmoothScroll();
  useSectionThemes();
  // O path da variante vira o `page` de todo evento de tracking — é o que
  // separa o funil de cada headline no admin.
  // No teste de subheadline o funil precisa se separar por SH, não pela
  // headline — que é a mesma em todas as variantes.
  useLandingTracking(subheadline?.path ?? headline.path);
  useLandingHit();

  /**
   * CTA da página. Desde 17/09/2026 NÃO abre mais o quiz: rola até o
   * formulário do topo e foca o primeiro campo. O teste Q1–Q5 foi encerrado,
   * então nada aqui sorteia célula (caminhoDoQuiz saiu da landing).
   *
   * Continua gravando `start_click` com o id do botão, para o painel seguir
   * contando cliques por CTA. NÃO usa `trackStartClick`: ele dispara o aviso
   * de saída da landing (que para o relógio de leitura das seções) e marca a
   * sessão como iniciada no quiz, e aqui a pessoa continua na página.
   */
  const handleStartClick = useCallback((buttonId: string) => {
    trackEvent("start_click", {
      buttonId,
      metadata: { destination: `#${FORMULARIO_TOPO_ID}`, source: "landing_cta" } as Json,
    }).catch(() => { /* ignore */ });
    rolarAteFormulario();
  }, [trackEvent]);

  // O CTA fixo do mobile some enquanto o formulário está na tela: ele levaria
  // para onde a pessoa já está e cobriria os últimos campos e o botão de envio.
  //
  // Some também sobre o CTA final (17/09/2026): era ali que os dois botões
  // dourados quase idênticos apareciam empilhados, um em cima do outro, sem
  // hierarquia nenhuma. Quem já chegou no CTA final tem o botão da seção na
  // frente; a barra fixa volta assim que ele sai da tela.
  const [ctaFixoOculto, setCtaFixoOculto] = useState(true);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const alvos = [
      document.getElementById(FORMULARIO_TOPO_ID),
      document.getElementById("cta-final"),
    ].filter((el): el is HTMLElement => !!el);
    if (alvos.length === 0) return;

    const naTela = new Set<Element>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) naTela.add(entry.target);
          else naTela.delete(entry.target);
        }
        setCtaFixoOculto(naTela.size > 0);
      },
      { threshold: 0 },
    );
    alvos.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    // `reducedMotion="user"` desliga as animações do framer-motion para quem
    // pediu menos movimento no sistema. O CSS já tem o corte equivalente.
    <MotionConfig reducedMotion="user">
    <NichoContext.Provider value={nicho}>
    <div className="min-h-screen relative bg-background">
      {/* Cinematic background layers */}
      <div className="cinematic-bg" />
      <div className="cinematic-glow" />
      <div className="cinematic-vignette" />
      <div className="cinematic-grid" />

      <LandingNavbar onCtaClick={() => handleStartClick("header_cta")} />

      <main>
        <section data-theme="cave" data-track-id="hero" data-track-order="10">
          <Hero variant={headline} subheadline={subheadline} />
        </section>

        {/* Cases logo abaixo do topo (pedido do Rodger, 17/09). A ordem 20 vale
            também em landingSections.ts e no admin-data, para o funil de seções. */}
        <section id="resultados" data-theme="void" data-track-id="success_cases" data-track-order="20">
          <CasesSucesso onCtaClick={handleStartClick} />
        </section>

        {/* Garantia do primeiro mês (28/09/2026), só na versão "prova". Logo
            depois dos cases: é onde o cético acabou de ver os números e
            pensa "sei, tá bom". A ordem 25 vale também em landingSections.ts. */}
        {copy.garantia && (
          <section id="garantia" data-theme="cave" data-track-id="garantia" data-track-order="25">
            <GarantiaSection />
          </section>
        )}

        <section id="problema" data-theme="ember" data-track-id="dor" data-track-order="30">
          <PainSection />
        </section>

        <section data-theme="cave" data-track-id="metodo" data-track-order="40">
          <MetodoChampion />
        </section>

        {/* Os prints de WhatsApp de cliente. A ordem 50 estava vaga desde que a
            seção saiu, em 17/09/2026: é o lugar dela, entre o método e o
            portfólio. Quem acabou de ler COMO a Champion trabalha encontra aqui
            a prova de que funciona, antes de ver o volume de criativo. */}
        <section id="feedbacks" data-theme="void" data-track-id="social_proof" data-track-order="50">
          <ClientFeedbacks />
        </section>

        <section data-theme="blue-temple" data-track-id="criativos" data-track-order="60">
          <VturbCreatives />
        </section>

        {/* CTA intermediário no padrão `cta-section` do mattered: hairline em
            cima, uma frase e um único botão primário. */}
        <section data-theme="cave" data-track-id="cta_intermediario" data-track-order="70" className="py-14 md:py-20">
          <div className="container mx-auto px-5 max-w-2xl">
            <div className="border-t border-white/10 pt-12 md:pt-16 text-center">
              <p className="text-base md:text-xl text-foreground/90 leading-snug max-w-md mx-auto mb-7 md:mb-8">
                {copy.ctaIntermediario.texto}
              </p>
              <Botao
                rotulo={copy.ctaIntermediario.rotulo}
                tamanho="lg"
                onClick={() => handleStartClick("start_btn_2")}
                data-track-click="cta_primary"
                data-track-id="cta_intermediario_btn"
              />
            </div>
          </div>
        </section>

        {/* Quem atende (28/09/2026), só na versão "prova". Antes do "como
            funciona": quem vai ler os passos já sabe o nome de quem chama. */}
        {copy.quemAtende && (
          <section id="quem-atende" data-theme="void" data-track-id="quem_atende" data-track-order="75">
            <QuemAtende />
          </section>
        )}

        <section data-theme="blue-temple" data-track-id="como_funciona" data-track-order="80">
          <HowItWorks />
        </section>

        <section id="faq" data-theme="cave" data-track-id="faq" data-track-order="90">
          <FAQSection />
        </section>

        <section data-theme="gold-haze" data-track-id="cta_final" data-track-order="100">
          <FinalCTA onStartClick={handleStartClick} />
        </section>
      </main>

      <Footer />

      {/* CTA fixo, só no celular. O rótulo é o mesmo dos cases ("Preencher
          aplicação"): "PREENCHER APLICAÇÃO GRATUITA" saiu porque era a segunda
          metade da dupla quase idêntica que aparecia sobre o CTA final. */}
      {!ctaFixoOculto && (
        <div className="cta-fixo fixed bottom-4 left-5 right-5 z-50 md:hidden">
          <Botao
            rotulo="Preencher aplicação"
            tamanho="lg"
            bloco
            onClick={() => handleStartClick("sticky_cta")}
          />
        </div>
      )}
    </div>
    </NichoContext.Provider>
    </MotionConfig>
  );
};

export default Index;
