import type { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  busy?: boolean;
};

export function Button({ variant = "primary", busy = false, className = "", children, disabled, ...props }: ButtonProps) {
  return (
    <button className={`button button-${variant} ${className}`} disabled={disabled || busy} aria-busy={busy} {...props}>
      {busy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

