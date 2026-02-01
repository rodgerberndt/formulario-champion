import { useRef } from "react";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { ValueProps } from "@/components/landing/ValueProps";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { SocialProof } from "@/components/landing/SocialProof";
import { QuizSection, QuizSectionHandle } from "@/components/landing/QuizSection";
import { FAQ } from "@/components/landing/FAQ";
import { Footer } from "@/components/landing/Footer";

const Index = () => {
  const quizRef = useRef<QuizSectionHandle>(null);

  const scrollToQuiz = () => {
    quizRef.current?.scrollIntoView();
  };

  const scrollToProcess = () => {
    const element = document.getElementById("how-it-works");
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onScrollToQuiz={scrollToQuiz} />
      
      <main>
        <Hero onScrollToQuiz={scrollToQuiz} onScrollToProcess={scrollToProcess} />
        <ProblemSection />
        <ValueProps onScrollToQuiz={scrollToQuiz} />
        <HowItWorks onScrollToQuiz={scrollToQuiz} />
        <SocialProof />
        <QuizSection ref={quizRef} />
        <FAQ />
      </main>

      <Footer />

      {/* Spacer for mobile bottom bar */}
      <div className="h-20 md:hidden" />
    </div>
  );
};

export default Index;
