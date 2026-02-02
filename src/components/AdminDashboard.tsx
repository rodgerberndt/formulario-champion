import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Bell, Eye, Check, RefreshCw, Users, ArrowLeft, LogOut } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface Lead {
  id: string;
  nome_completo: string;
  whatsapp: string;
  instagram: string;
  mercado: string;
  estagio_negocio: string;
  dor_desejo: string;
  lido: boolean;
  created_at: string;
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isRinging, setIsRinging] = useState(false);

  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching leads:", error);
      toast({
        title: "Erro ao carregar leads",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setLeads(data || []);
      setUnreadCount(data?.filter((l) => !l.lido).length || 0);
    }
    setLoading(false);
  };

  const playNotificationSound = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

    setIsRinging(true);
    setTimeout(() => setIsRinging(false), 1000);
  };

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from("leads")
      .update({ lido: true })
      .eq("id", id);

    if (error) {
      console.error("Error marking as read:", error);
    } else {
      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, lido: true } : l))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  };

  const openLead = (lead: Lead) => {
    setSelectedLead(lead);
    if (!lead.lido) {
      markAsRead(lead.id);
    }
  };

  useEffect(() => {
    fetchLeads();

    const channel = supabase
      .channel("leads-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "leads",
        },
        (payload) => {
          const newLead = payload.new as Lead;
          setLeads((prev) => [newLead, ...prev]);
          setUnreadCount((prev) => prev + 1);
          playNotificationSound();
          toast({
            title: "🔔 Novo lead recebido!",
            description: `${newLead.nome_completo} acabou de preencher o formulário.`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button variant="championOutline" size="lg" onClick={() => navigate("/")}>
              <ArrowLeft className="w-5 h-5" />
              Ir para Formulário
            </Button>
            <div>
              <h1 className="font-display text-4xl font-bold champion-gradient-text tracking-wider">
                PAINEL DE LEADS
              </h1>
              <p className="text-muted-foreground text-sm">
                Gerencie todas as respostas do formulário
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="championOutline"
              onClick={fetchLeads}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/admin-login");
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>

            <div className="relative">
              <Bell
                className={`w-8 h-8 text-secondary ${
                  isRinging ? "animate-ring" : ""
                }`}
              />
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="champion-card flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-secondary/20 flex items-center justify-center">
              <Users className="w-7 h-7 text-secondary" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Total de Leads</p>
              <p className="text-3xl font-bold text-foreground">{leads.length}</p>
            </div>
          </div>
          <div className="champion-card flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center">
              <Bell className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Não Lidos</p>
              <p className="text-3xl font-bold text-foreground">{unreadCount}</p>
            </div>
          </div>
          <div className="champion-card flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-green-500/20 flex items-center justify-center">
              <Check className="w-7 h-7 text-green-500" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Lidos</p>
              <p className="text-3xl font-bold text-foreground">
                {leads.length - unreadCount}
              </p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="champion-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-muted/50">
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Nome</TableHead>
                <TableHead className="text-muted-foreground">WhatsApp</TableHead>
                <TableHead className="text-muted-foreground">Mercado</TableHead>
                <TableHead className="text-muted-foreground">Estágio</TableHead>
                <TableHead className="text-muted-foreground">Data</TableHead>
                <TableHead className="text-muted-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow
                  key={lead.id}
                  className={`border-border hover:bg-muted/30 cursor-pointer transition-colors ${
                    !lead.lido ? "bg-secondary/5" : ""
                  }`}
                  onClick={() => openLead(lead)}
                >
                  <TableCell>
                    {lead.lido ? (
                      <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
                        Lido
                      </Badge>
                    ) : (
                      <Badge className="bg-secondary text-secondary-foreground">
                        Novo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    {lead.nome_completo}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.whatsapp}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.mercado}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.estagio_negocio}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(lead.created_at), "dd/MM/yyyy HH:mm", {
                      locale: ptBR,
                    })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openLead(lead);
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {leads.length === 0 && !loading && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-12"
                  >
                    Nenhum lead encontrado ainda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Lead Detail Dialog */}
        <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
          <DialogContent className="bg-card border-border max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-3xl champion-gradient-text tracking-wider">
                DETALHES DO LEAD
              </DialogTitle>
            </DialogHeader>
            {selectedLead && (
              <div className="space-y-6 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Nome Completo</label>
                    <p className="text-lg font-medium text-foreground">
                      {selectedLead.nome_completo}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">WhatsApp</label>
                    <p className="text-lg font-medium text-foreground">
                      <a
                        href={`https://wa.me/55${selectedLead.whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-secondary hover:underline"
                      >
                        {selectedLead.whatsapp}
                      </a>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Instagram</label>
                    <p className="text-lg font-medium text-foreground">
                      <a
                        href={`https://instagram.com/${selectedLead.instagram.replace("@", "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-secondary hover:underline"
                      >
                        {selectedLead.instagram}
                      </a>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Mercado</label>
                    <p className="text-lg font-medium text-foreground">
                      {selectedLead.mercado}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Estágio do Negócio</label>
                    <p className="text-lg font-medium text-foreground">
                      {selectedLead.estagio_negocio}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Data de Cadastro</label>
                    <p className="text-lg font-medium text-foreground">
                      {format(new Date(selectedLead.created_at), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">
                    Dor / Desejo
                  </label>
                  <div className="mt-2 p-4 bg-muted/30 rounded-lg">
                    <p className="text-foreground whitespace-pre-wrap">
                      {selectedLead.dor_desejo}
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <Button
                    variant="champion"
                    className="flex-1"
                    onClick={() =>
                      window.open(
                        `https://wa.me/55${selectedLead.whatsapp.replace(/\D/g, "")}`,
                        "_blank"
                      )
                    }
                  >
                    Abrir WhatsApp
                  </Button>
                  <Button
                    variant="championOutline"
                    className="flex-1"
                    onClick={() =>
                      window.open(
                        `https://instagram.com/${selectedLead.instagram.replace("@", "")}`,
                        "_blank"
                      )
                    }
                  >
                    Ver Instagram
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
