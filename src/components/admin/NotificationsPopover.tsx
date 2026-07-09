import { useState } from "react";
import { Bell, BellOff, FlaskConical, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

interface Props {
  notificationsEnabled: boolean;
  pushSubscribed: boolean;
  subscriberCount: number | null;
  toggleNotifications: () => void | Promise<void>;
  testNotifications: () => void | Promise<void>;
  sendWebPush: (title: string, body: string, sound?: string) => Promise<void>;
}

const SOUND_OPTIONS = [
  { value: "newlead", label: "🔔 Novo lead", file: "/newlead.wav" },
  { value: "cashregister", label: "💰 Venda (caixa)", file: "/cashregister.mp3" },
  { value: "meeting", label: "📅 Reunião", file: "/meeting.wav" },
  { value: "default", label: "🔕 Padrão (sem áudio extra)", file: "" },
];

function playPreview(file: string) {
  if (!file) return;
  try {
    const a = new Audio(file);
    a.volume = 0.7;
    a.play().catch(() => {});
  } catch {}
}

export function NotificationsPopover({
  notificationsEnabled,
  pushSubscribed,
  subscriberCount,
  toggleNotifications,
  testNotifications,
  sendWebPush,
}: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sound, setSound] = useState("newlead");
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleSendCustom = async () => {
    if (!title.trim() || !body.trim()) {
      toast({
        title: "Preencha título e descrição",
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    try {
      await sendWebPush(title.trim(), body.trim(), sound);
      const opt = SOUND_OPTIONS.find((s) => s.value === sound);
      if (opt) playPreview(opt.file);
      toast({ title: "✅ Notificação enviada!", description: title });
      setTitle("");
      setBody("");
    } finally {
      setSending(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await testNotifications();
    } finally {
      setTesting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={notificationsEnabled ? "default" : "outline"}
          size="sm"
          className={`text-xs sm:text-sm relative ${
            notificationsEnabled
              ? "bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30"
              : ""
          }`}
        >
          <Bell
            className={`w-4 h-4 sm:mr-1.5 ${
              notificationsEnabled ? "animate-pulse" : ""
            }`}
          />
          <span className="hidden sm:inline">Notificações</span>
          {notificationsEnabled && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-4 space-y-4">
        <div className="space-y-1">
          <h4 className="font-semibold text-sm">Central de Notificações</h4>
          <p className="text-xs text-muted-foreground">
            Gerencie alertas e dispare notificações personalizadas.
          </p>
        </div>

        {/* Status */}
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 flex items-center gap-2 text-xs">
          <Radio className={`w-3.5 h-3.5 shrink-0 ${pushSubscribed ? "text-primary" : "text-muted-foreground"}`} />
          <span className="text-muted-foreground">
            {pushSubscribed ? "Push ativo neste dispositivo" : "Push não ativo neste dispositivo"}
            {" · "}
            {subscriberCount === null
              ? "carregando…"
              : `${subscriberCount} dispositivo${subscriberCount === 1 ? "" : "s"} recebendo`}
          </span>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 gap-2">
          <Button
            variant={notificationsEnabled ? "default" : "outline"}
            size="sm"
            onClick={toggleNotifications}
            className="justify-start text-xs"
          >
            {notificationsEnabled ? (
              <Bell className="w-4 h-4 mr-2" />
            ) : (
              <BellOff className="w-4 h-4 mr-2" />
            )}
            {notificationsEnabled ? "Notificações ativadas" : "Ativar notificações"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing}
            className="justify-start text-xs"
          >
            <FlaskConical className="w-4 h-4 mr-2" />
            {testing ? "Testando..." : "Testar notificações"}
          </Button>
        </div>

        <div className="border-t border-border pt-3 space-y-2">
          <h5 className="text-xs font-semibold text-foreground">
            Enviar notificação personalizada
          </h5>
          <Input
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            className="text-sm"
          />
          <Textarea
            placeholder="Descrição"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={200}
            rows={3}
            className="text-sm resize-none"
          />
          <div className="flex gap-2">
            <Select value={sound} onValueChange={setSound}>
              <SelectTrigger className="text-xs flex-1">
                <SelectValue placeholder="Som" />
              </SelectTrigger>
              <SelectContent>
                {SOUND_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                const opt = SOUND_OPTIONS.find((s) => s.value === sound);
                if (opt) playPreview(opt.file);
              }}
            >
              ▶
            </Button>
          </div>
          <Button
            size="sm"
            onClick={handleSendCustom}
            disabled={sending}
            className="w-full text-xs"
          >
            {sending ? "Enviando..." : "Enviar notificação"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
