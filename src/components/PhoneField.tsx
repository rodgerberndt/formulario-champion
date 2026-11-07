import { useEffect, useMemo, useState } from "react";
import PhoneInput, { type Country } from "react-phone-number-input";
import { isValidPhoneNumber, parsePhoneNumber, parsePhoneNumberFromString } from "libphonenumber-js";
import "react-phone-number-input/style.css";
import "@/styles/phone-field.css";
import ptBR from "react-phone-number-input/locale/pt-BR.json";
import { Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountrySearchSelect } from "@/components/CountrySearchSelect";

export interface PhoneFieldProps {
  /** Valor canônico em E.164 (ex.: +5511999999999) ou string vazia. */
  value: string;
  /**
   * Chamado sempre que o valor muda. Recebe o E.164 (ou "") e um boolean
   * indicando se o número é válido segundo a libphonenumber.
   */
  onChange: (e164: string, isValid: boolean) => void;
  placeholder?: string;
  defaultCountry?: Country;
  className?: string;
  id?: string;
  /** Mostra mensagens de erro. Por padrão só mostra após o usuário começar a digitar. */
  showErrors?: boolean;
}

/**
 * Fusos do Brasil. É uma lista fechada e estável, e é o que permite dizer
 * "esta pessoa está no Brasil" sem depender do idioma do aparelho.
 */
const FUSOS_BR = new Set([
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Fortaleza",
  "America/Recife",
  "America/Maceio",
  "America/Araguaina",
  "America/Belem",
  "America/Santarem",
  "America/Manaus",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Eirunepe",
  "America/Noronha",
]);

/**
 * País inicial do campo.
 *
 * ANTES ISSO VINHA DO IDIOMA DO APARELHO e foi a causa de lead entrando com
 * número errado (21/09/2026): `navigator.language` de um celular em inglês é
 * "en-US", então o campo abria em +1 para um brasileiro. Ele digitava o DDD
 * achando que era o dele e o número saía como telefone americano. Idioma diz
 * em que língua a pessoa usa o telefone, não de onde ela é.
 *
 * O fuso horário diz onde ela está e não muda quando ela troca o idioma, então
 * é ele que manda. O locale continua como reserva, para quem bloqueia a API de
 * fuso, e o Brasil é o último fallback porque é de onde vem quase todo lead.
 */
function inferDefaultCountry(): Country {
  try {
    const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (fuso && FUSOS_BR.has(fuso)) return "BR";
  } catch {
    /* Intl indisponível: cai no locale abaixo */
  }
  if (typeof navigator === "undefined") return "BR";
  const lang = navigator.language || (navigator.languages && navigator.languages[0]) || "";
  const region = lang.split("-")[1];
  if (region && region.length === 2) return region.toUpperCase() as Country;
  if (lang.toLowerCase().startsWith("pt")) return "BR";
  if (lang.toLowerCase().startsWith("en")) return "US";
  return "BR";
}

export function PhoneField({
  value,
  onChange,
  placeholder = "(DDD) 99999-9999",
  defaultCountry,
  className,
  id,
  showErrors = true,
}: PhoneFieldProps) {
  const initialCountry = useMemo<Country>(
    () => defaultCountry ?? inferDefaultCountry(),
    [defaultCountry]
  );

  const [touched, setTouched] = useState<boolean>(Boolean(value));

  const isValid = useMemo(() => {
    if (!value) return false;
    try {
      return isValidPhoneNumber(value);
    } catch {
      return false;
    }
  }, [value]);

  // Garante que o callback seja avisado caso a validade mude por troca de país etc.
  useEffect(() => {
    if (!value) return;
    try {
      const parsed = parsePhoneNumber(value);
      if (parsed && parsed.number !== value) {
        onChange(parsed.number, parsed.isValid());
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (next?: string) => {
    const e164 = next ?? "";
    let valid = false;
    if (e164) {
      try {
        valid = isValidPhoneNumber(e164);
      } catch {
        valid = false;
      }
    }
    onChange(e164, valid);
  };

  const showInvalid = showErrors && touched && Boolean(value) && !isValid;
  const showEmpty = showErrors && touched && !value;

  /**
   * O número está marcado como de um país, e a pessoa está em outro?
   *
   * Rede de baixo para quem abriu o campo com o país errado. A tentação aqui
   * era montar o número certo sozinho (pegar os dígitos e grudar +55), e ela é
   * uma armadilha por dois motivos. Primeiro, `+1 212 555 1234` é um número de
   * Nova York perfeitamente válido, e lido como brasileiro vira um fixo do Rio
   * igualmente válido: a gente ofereceria estragar o número de quem acertou.
   * Segundo, e pior: com o país errado o `limitMaxLength` corta o campo no
   * comprimento DAQUELE país, então o brasileiro que digitou 11 dígitos em um
   * campo de 10 já perdeu um. Remontar esses dígitos com +55 produziria um
   * número válido, plausível e DE OUTRA PESSOA.
   *
   * Então aqui a gente só APONTA a divergência entre o país do número e o fuso
   * de quem está digitando, e deixa a correção com quem sabe o próprio número.
   */
  const paisDivergente = useMemo(() => {
    if (!value) return null;
    const lido = parsePhoneNumberFromString(value);
    const pais = lido?.country;
    if (!pais || pais === "BR") return null;
    let noBrasil = false;
    try {
      noBrasil = FUSOS_BR.has(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      return null;
    }
    if (!noBrasil) return null;
    return (ptBR as Record<string, string>)[pais] || pais;
  }, [value]);

  /** O número final, formatado, para a pessoa conferir antes de enviar. */
  const numeroFormatado = useMemo(() => {
    if (!value || !isValid) return null;
    try {
      return parsePhoneNumber(value).formatInternational();
    } catch {
      return null;
    }
  }, [value, isValid]);

  return (
    <div className={cn("phone-field-wrapper", className)}>
      <div
        className={cn(
          "phone-field-shell",
          isValid && "phone-field-shell--valid",
          showInvalid && "phone-field-shell--invalid"
        )}
      >
        <PhoneInput
          id={id}
          /*
           * SEM `international` de propósito (21/09/2026).
           *
           * Com ela, o campo escrevia no formato internacional: "+55 11 98765
           * 4321", grupos soltos separados por espaço. Sem ela, o campo usa o
           * formato nacional do país selecionado e vira "(11) 98765-4321", que
           * é como o brasileiro lê o próprio número — parêntese no DDD, hífen
           * antes dos quatro últimos. Conferir dígito nesse formato é imediato,
           * e é esse o ponto: o erro que chega aqui é dígito trocado.
           *
           * O valor gravado não muda: a lib continua devolvendo E.164 no
           * onChange, porque `defaultCountry` está definido. O código do país
           * segue visível na bandeira, e o número internacional completo
           * aparece na linha de conferência abaixo do campo.
           */
          defaultCountry={initialCountry}
          value={value || undefined}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          placeholder={placeholder}
          countryCallingCodeEditable={false}
          labels={ptBR}
          countrySelectComponent={CountrySearchSelect}
          limitMaxLength
          autoComplete="tel"
          numberInputProps={{
            inputMode: "tel",
            "aria-invalid": showInvalid || undefined,
          }}
        />
        {value ? (
          isValid ? (
            <Check className="phone-field-status text-secondary" aria-hidden />
          ) : showInvalid ? (
            <AlertCircle className="phone-field-status text-destructive" aria-hidden />
          ) : null
        ) : null}
      </div>
      {showInvalid && (
        <p className="mt-1.5 text-xs text-destructive">Digite um número de telefone válido</p>
      )}
      {showEmpty && (
        <p className="mt-1.5 text-xs text-destructive">Informe seu número para continuar</p>
      )}
      {paisDivergente && (
        <p className="mt-1.5 text-xs text-secondary">
          Seu número está sendo salvo como {paisDivergente}. Se você é do Brasil, toque na bandeira
          e escolha Brasil antes de enviar.
        </p>
      )}
      {/* Confere o que a pessoa escreveu, do jeito que a gente vai chamar. É o
          que pega o dígito a mais ou a menos, que a validação aceita quando o
          número continua sendo possível. */}
      {numeroFormatado && !paisDivergente && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Vamos chamar no <span className="text-foreground font-medium">{numeroFormatado}</span>
        </p>
      )}
    </div>
  );
}

export function isPhoneE164Valid(value: string | undefined | null): boolean {
  if (!value) return false;
  try {
    return isValidPhoneNumber(value);
  } catch {
    return false;
  }
}