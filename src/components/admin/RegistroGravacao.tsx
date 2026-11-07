// Subir a gravação da call para o Drive, em dois cliques.
//
// A gravação sempre existiu; o que não existia era um lugar previsível para
// ela. Cada call parava numa pasta diferente e ninguém reencontrava nada, então
// o material que deveria ensinar o funil não ensinava nada — o ponto inteiro de
// gravar é conseguir assistir dez calls do mesmo criativo em sequência e ver o
// que se repete.
//
// O fluxo aqui é o mais curto possível, porque ele acontece nos dois minutos
// depois de uma call e concorre com a próxima: abre a pasta certa, sobe o
// arquivo, cola o link. A pasta certa é calculada pelo criativo que trouxe o
// lead (`baldeDaGravacao`), e fica registrada por balde: da segunda gravação do
// mesmo criativo em diante o botão já abre direto no lugar.
//
// Enquanto o Drive não estiver conectado por OAuth, é o Caio quem cola o link
// da pasta uma vez por balde. Quando estiver, `drive_folders` passa a ser
// preenchida pela API e esta tela não muda.

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, FolderOpen, Video, ExternalLink, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchAdmin, getAdminToken } from "@/lib/adminAuth";
import { baldeDaGravacao, type DadosDoBalde } from "@/lib/funis";

interface PastaDoDrive {
  bucket: string;
  label: string | null;
  folder_url: string;
}

interface Props {
  reuniao: DadosDoBalde & {
    id: string;
    notes?: string | null;
    recording_url?: string | null;
    recording_uploaded_at?: string | null;
  };
  /** Quem está registrando. Vai para `recording_by`. */
  autor?: string;
  /** Chamado depois de salvar, para a lista se atualizar. */
  aoSalvar: (recording_url: string, recording_folder: string) => void;
}

const DRIVE_RAIZ = "https://drive.google.com/drive/my-drive";

export default function RegistroGravacao({ reuniao, autor = "Caio", aoSalvar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [pastas, setPastas] = useState<PastaDoDrive[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [link, setLink] = useState(reuniao.recording_url || "");
  const [linkDaPasta, setLinkDaPasta] = useState("");

  const balde = baldeDaGravacao(reuniao);
  const pasta = pastas.find((p) => p.bucket === balde.bucket) || null;

  const base = import.meta.env.VITE_SUPABASE_URL;

  const carregarPastas = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetchAdmin(`${base}/functions/v1/admin-data/drive-folders`, {
        headers: { "x-admin-token": getAdminToken() || "" },
      });
      const j = await res.json();
      setPastas(Array.isArray(j) ? j : []);
    } catch {
      setPastas([]);
    } finally {
      setCarregando(false);
    }
  }, [base]);

  useEffect(() => {
    if (aberto) carregarPastas();
  }, [aberto, carregarPastas]);

  const registrarPasta = async () => {
    const url = linkDaPasta.trim();
    if (!url) return;
    setSalvando(true);
    try {
      const qs = new URLSearchParams({
        _method: "POST",
        bucket: balde.bucket,
        label: balde.label,
        folder_url: url,
      });
      const res = await fetchAdmin(`${base}/functions/v1/admin-data/drive-folders?${qs}`, {
        headers: { "x-admin-token": getAdminToken() || "" },
      });
      if (!res.ok) throw new Error("falha ao registrar a pasta");
      setLinkDaPasta("");
      await carregarPastas();
      toast({ title: "Pasta registrada", description: `Toda call de ${balde.label} vai para lá.` });
    } catch {
      toast({ title: "Não deu para registrar a pasta", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const salvarGravacao = async () => {
    const url = link.trim();
    if (!url) {
      toast({ title: "Cole o link da gravação", variant: "destructive" });
      return;
    }
    setSalvando(true);
    try {
      const res = await fetchAdmin(`${base}/functions/v1/admin-data/meetings/${reuniao.id}`, {
        method: "PUT",
        headers: { "x-admin-token": getAdminToken() || "", "Content-Type": "application/json" },
        body: JSON.stringify({
          recording_url: url,
          // O balde é congelado aqui: o criativo do lead pode ser renomeado
          // depois, e a gravação continua onde foi parar.
          recording_folder: balde.bucket,
          recording_by: autor,
        }),
      });
      if (!res.ok) throw new Error("falha ao salvar");
      aoSalvar(url, balde.bucket);
      setAberto(false);
      toast({ title: "Gravação registrada!" });
    } catch {
      toast({ title: "Erro ao salvar a gravação", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const jaTem = !!reuniao.recording_url;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAberto(true)}
        title={jaTem ? "Gravação registrada — clique para ver ou trocar" : "Subir gravação da call"}
        className={jaTem ? "text-emerald-400" : "text-muted-foreground"}
      >
        {jaTem ? <Check className="w-4 h-4" /> : <Video className="w-4 h-4" />}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gravação da call</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 rounded-md bg-accent/20 text-sm space-y-1">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Lead:</span>
                <span className="font-medium text-right truncate">{reuniao.notes || "—"}</span>
              </div>
              <div className="flex justify-between gap-2 items-center">
                <span className="text-muted-foreground">Pasta:</span>
                <Badge variant="outline" className="text-[10px]">{balde.label}</Badge>
              </div>
            </div>

            {carregando ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : pasta ? (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(pasta.folder_url, "_blank", "noopener")}
                >
                  <FolderOpen className="w-4 h-4 mr-2" /> Abrir a pasta e subir o arquivo
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Suba a gravação lá, copie o link do arquivo e cole abaixo.
                </p>
              </div>
            ) : (
              // Primeira gravação deste balde: não existe pasta registrada
              // ainda. Registrar aqui, uma vez, é o que faz as próximas calls do
              // mesmo criativo abrirem direto — sem isso cada call recomeça a
              // procurar onde salvar, que é exatamente o problema de hoje.
              <div className="space-y-2 border border-amber-500/25 bg-amber-500/5 rounded-md p-3">
                <p className="text-xs text-amber-300 font-medium">
                  Primeira gravação de {balde.label}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Crie (ou escolha) a pasta no Drive e cole o link dela aqui. Isso é
                  pedido uma única vez: as próximas calls deste mesmo criativo já
                  abrem direto nela.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => window.open(DRIVE_RAIZ, "_blank", "noopener")}
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-2" /> Abrir o Drive
                </Button>
                <Input
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={linkDaPasta}
                  onChange={(e) => setLinkDaPasta(e.target.value)}
                />
                <Button
                  size="sm"
                  className="w-full"
                  onClick={registrarPasta}
                  disabled={salvando || !linkDaPasta.trim()}
                >
                  {salvando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Registrar pasta de {balde.label}
                </Button>
              </div>
            )}

            <div>
              <label className="text-sm text-muted-foreground">Link da gravação</label>
              <Input
                placeholder="https://drive.google.com/file/d/..."
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
              {reuniao.recording_uploaded_at && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Já registrada em{" "}
                  {new Date(reuniao.recording_uploaded_at).toLocaleString("pt-BR", {
                    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                  })}
                  .
                </p>
              )}
            </div>

            <Button className="w-full" onClick={salvarGravacao} disabled={salvando || !link.trim()}>
              {salvando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar gravação
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
