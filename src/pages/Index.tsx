import { useRef } from "react";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { QuizSection, QuizSectionHandle } from "@/components/landing/QuizSection";
import { Footer } from "@/components/landing/Footer";

const Index = () => {
  const quizRef = useRef<QuizSectionHandle>(null);

  const scrollToQuiz = () => {
    quizRef.current?.scrollIntoView();
  };

  return (
    <div className="min-h-screen">
      <Header onScrollToQuiz={scrollToQuiz} />
      
      <main>
        <Hero onScrollToQuiz={scrollToQuiz} />
        <QuizSection ref={quizRef} />
      </main>

      <Footer />

      {/* Spacer for mobile bottom bar */}
      <div className="h-16 md:hidden" />
    </div>
  );
};

export default Index;
