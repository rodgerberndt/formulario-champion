import type { ReactNode } from "react";
import { BellOff, Download, RefreshCw, Smartphone, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Faixa fixa no topo do painel enquanto este aparelho NÃO estiver pronto para
 * receber lead. O alert avisa uma vez; a faixa não deixa esquecer.
 *
 * Mostra só o problema mais urgente, na ordem em que eles se resolvem: sem app
 * instalado no iPhone não existe permissão; sem permissão não existe push; sem
 * dono o push não sabe de quem é o lead.
 */
interface Props {
  permissionState: NotificationPermission | "indisponivel";
  ios: boolean;
  instalado: boolean;
  pessoa: string | null;
  novaVersao: boolean;
  onAtualizar: () => void;
  podeInstalar: boolean;
  onInstalar: () => void;
  onAtivar: () => void;
}

export function AvisoNotificacoes({
  permissionState, ios, instalado, pessoa, novaVersao, onAtualizar, podeInstalar, onInstalar, onAtivar,
}: Props) {
  let conteudo: ReactNode = null;

  if (ios && !instalado) {
    conteudo = (
      <>
        <Smartphone className="w-4 h-4 shrink-0" />
        <span>
          No iPhone a notificação só funciona com o app instalado: toque em <strong>Compartilhar</strong> →{" "}
          <strong>Adicionar à Tela de Início</strong> e abra o painel por lá.
        </span>
      </>
    );
  } else if (permissionState === "denied") {
    conteudo = (
      <>
        <BellOff className="w-4 h-4 shrink-0" />
        <span>
          Notificações <strong>bloqueadas</strong> neste aparelho: você não fica sabendo quando um lead cai.{" "}
          {ios || /Android/i.test(navigator.userAgent)
            ? "Ajustes do celular → Notificações → Champion → Permitir."
            : "Clique no cadeado ao lado do endereço → Notificações → Permitir, e recarregue."}
        </span>
      </>
    );
  } else if (permissionState === "default") {
    conteudo = (
      <>
        <BellOff className="w-4 h-4 shrink-0" />
        <span>Notificações ainda não ativadas neste aparelho.</span>
        <Button size="sm" variant="secondary" className="h-7 text-xs ml-auto" onClick={onAtivar}>
          Ativar agora
        </Button>
      </>
    );
  }
  // Nome deixou de ser condição em 14/09: todo aparelho inscrito recebe todos os leads.
  void pessoa;

  const aviso = conteudo && (
    <div className="flex items-center gap-2 bg-rose-600 text-white text-xs sm:text-sm px-4 py-2">{conteudo}</div>
  );

  const versao = novaVersao && (
    <div className="flex items-center gap-2 bg-amber-500 text-black text-xs sm:text-sm px-4 py-2">
      <RefreshCw className="w-4 h-4 shrink-0" />
      <span>Saiu uma versão nova do sistema. Salve o que estiver preenchendo e atualize.</span>
      <Button size="sm" variant="secondary" className="h-7 text-xs ml-auto" onClick={onAtualizar}>
        Atualizar agora
      </Button>
    </div>
  );

  // Instalar como app fica no rodapé do popover: é opcional no PC, e faixa no
  // topo para coisa opcional é o ruído que faz ninguém ler a faixa que importa.
  void podeInstalar;
  void onInstalar;

  if (!aviso && !versao) return null;
  return (
    <div>
      {aviso}
      {versao}
    </div>
  );
}

/** Passo a passo de reinstalação, aberto pelo push "reinstalar". */
export function ReinstalarAppDialog({ open, onClose, ios }: { open: boolean; onClose: () => void; ios: boolean }) {
  const android = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>♻️ Reinstale o app do painel</DialogTitle>
          <DialogDescription>
            O sistema mudou de um jeito que o app instalado não pega sozinho (ícone, nome ou tela inicial). Leva 1 minuto.
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal pl-5 space-y-2 text-sm">
          {ios ? (
            <>
              <li>Na tela de início, segure o ícone <strong>Champion</strong> → <strong>Remover App</strong> → <strong>Apagar da Tela de Início</strong>.</li>
              <li>Abra o <strong>Safari</strong> em <strong>www.championadstudio.com/admin</strong>.</li>
              <li>Toque em <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong> → <strong>Adicionar</strong>.</li>
              <li>Abra o app pelo ícone novo, faça login e toque em <strong>Permitir</strong> quando pedir notificações.</li>
            </>
          ) : android ? (
            <>
              <li>Segure o ícone <strong>Champion</strong> → <strong>Desinstalar</strong> (ou arraste para Remover).</li>
              <li>Abra o <strong>Chrome</strong> em <strong>www.championadstudio.com/admin</strong>.</li>
              <li>Menu ⋮ → <strong>Instalar app</strong> (ou "Adicionar à tela inicial").</li>
              <li>Abra pelo ícone novo, faça login e toque em <strong>Permitir</strong> nas notificações.</li>
            </>
          ) : (
            <>
              <li>No app do painel, menu ⋮ do canto superior → <strong>Desinstalar Champion</strong>.</li>
              <li>Abra o Chrome em <strong>www.championadstudio.com/admin</strong>.</li>
              <li>Clique no ícone de instalar na barra de endereço (ou no botão <strong>Instalar app</strong> do topo).</li>
              <li>Abra o app, faça login e permita as notificações.</li>
            </>
          )}
          <li>Em <strong>Notificações</strong>, escolha seu nome e toque em <strong>Testar notificações</strong>.</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Reinstalar apaga a inscrição de push antiga deste aparelho. Até você abrir o app novo e permitir, os leads não
          tocam aqui.
        </p>
        <Button onClick={onClose} className="w-full">Entendi</Button>
      </DialogContent>
    </Dialog>
  );
}
