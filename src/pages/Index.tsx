import { useState } from "react";
import { LeadForm } from "@/components/LeadForm";
import { AdminDashboard } from "@/components/AdminDashboard";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

const Index = () => {
  const [showAdmin, setShowAdmin] = useState(false);

  if (showAdmin) {
    return <AdminDashboard onBack={() => setShowAdmin(false)} />;
  }

  return (
    <div className="relative">
      {/* Admin Access Button */}
      <div className="fixed top-4 right-4 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowAdmin(true)}
          className="text-muted-foreground hover:text-secondary"
        >
          <Settings className="w-5 h-5" />
        </Button>
      </div>
      
      <LeadForm />
    </div>
  );
};

export default Index;
