import { useEffect, useMemo, useState } from "react";
import PhoneInput, { type Country } from "react-phone-number-input";
import { isValidPhoneNumber, parsePhoneNumber } from "libphonenumber-js";
import "react-phone-number-input/style.css";
import "@/styles/phone-field.css";
import { Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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

function inferDefaultCountry(): Country {
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
  placeholder = "Seu número de WhatsApp",
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
          international
          defaultCountry={initialCountry}
          value={value || undefined}
          onChange={handleChange}
          onBlur={() => setTouched(true)}
          placeholder={placeholder}
          countryCallingCodeEditable={false}
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