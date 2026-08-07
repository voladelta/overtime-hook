import type { ButtonHTMLAttributes, ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: "primary" | "secondary" | "ghost"
  size?: "sm" | "md" | "lg"
  leadingIcon?: LucideIcon
  loading?: boolean
}

export function Button({
  children,
  className = "",
  variant = "primary",
  size = "md",
  leadingIcon: LeadingIcon,
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button--${variant} button--${size} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      <span className="button__surface" aria-hidden="true" />
      <span className={`button__content${loading ? " is-loading" : ""}`}>
        {LeadingIcon ? <LeadingIcon size={size === "sm" ? 14 : 17} aria-hidden="true" /> : null}
        <span>{children}</span>
      </span>
      {loading ? <span className="button__spinner" aria-label="Waiting for wallet" /> : null}
    </button>
  )
}
