import { Download, Check, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePwaInstall } from "@/hooks/usePwaInstall";

export function PwaInstallButton() {
  const { canInstall, isInstalled, install, showInstructions, setShowInstructions } =
    usePwaInstall();

  if (isInstalled) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="text-xs gap-1.5 border-primary/30 text-primary cursor-default opacity-70"
        disabled
      >
        <Check className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Instalado ✓</span>
      </Button>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
        onClick={() => install()}
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Instalar Champion</span>
        <span className="sm:hidden">Instalar</span>
      </Button>

      {/* Instructions Modal for unsupported browsers */}
      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5 text-primary" />
              Instalar Champion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Para instalar o Champion como app no seu desktop:
            </p>
            <div className="space-y-3">
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-sm font-medium mb-1">
                  Chrome / Edge
                </p>
                <p className="text-xs text-muted-foreground">
                  Clique no menu <span className="font-mono bg-muted px-1 rounded">⋮</span> → <strong>Instalar Champion</strong>
                </p>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-sm font-medium mb-1">
                  Safari (Mac)
                </p>
                <p className="text-xs text-muted-foreground">
                  Clique em <strong>Arquivo</strong> → <strong>Adicionar ao Dock</strong>
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Após instalar, o Champion abrirá como uma janela separada — igual a um app nativo.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
