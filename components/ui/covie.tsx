import { X } from "lucide-react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type Accent = "coral" | "teal" | "sunshine" | "violet";
type Tone = Accent | "danger" | "neutral";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function CoviePage({
  children,
  className,
  width = "standard",
}: {
  children: ReactNode;
  className?: string;
  width?: "standard" | "wide";
}) {
  return (
    <main
      className={classes(
        "covie-page",
        width === "wide" && "covie-page-wide",
        className,
      )}
    >
      {children}
    </main>
  );
}

export function CoviePageHeader({
  accent,
  title,
  context,
  actions,
  leading,
  className,
}: {
  accent: Accent;
  title: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
  className?: string;
}) {
  const heading = (
    <div className="covie-page-heading">
      <div
        className="covie-page-accent"
        data-accent={accent}
        aria-hidden="true"
      />
      <h1 className="covie-page-title">{title}</h1>
      {context ? <div className="covie-page-context">{context}</div> : null}
    </div>
  );

  return (
    <header className={classes("covie-page-header", className)}>
      <div className="covie-page-header-row">
        {leading ? (
          <div className="covie-page-header-main">
            <div className="covie-page-header-leading">{leading}</div>
            {heading}
          </div>
        ) : (
          heading
        )}
        {actions}
      </div>
    </header>
  );
}

export function CoviePageActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={classes("covie-page-actions", className)}>{children}</div>
  );
}

export function CovieCard({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classes("covie-card", className)} {...props}>
      {children}
    </div>
  );
}

export function CovieStrongCard({
  children,
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return (
    <div
      className={classes("covie-strong-card", className)}
      data-tone={tone}
      {...props}
    >
      {children}
    </div>
  );
}

export function CovieMetricCard({
  children,
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return (
    <div
      className={classes("covie-metric-card", className)}
      data-tone={tone}
      {...props}
    >
      {children}
    </div>
  );
}

const buttonClassByTone: Record<Tone, string> = {
  coral: "covie-primary-action",
  teal: "covie-action-teal",
  sunshine: "covie-action-sunshine",
  violet: "covie-action-violet",
  danger: "covie-action-danger",
  neutral: "covie-action-secondary",
};

export function CovieButton({
  className,
  tone = "coral",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type={type}
      className={classes("covie-button", buttonClassByTone[tone], className)}
      {...props}
    />
  );
}

export function CovieIconButton({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={classes("covie-icon-button covie-icon-button-control", className)}
      {...props}
    />
  );
}

export function CovieInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={classes("covie-input", className)} {...props} />;
}

export function CovieSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={classes("covie-select", className)} {...props}>
      {children}
    </select>
  );
}

export function CovieTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={classes("covie-textarea", className)} {...props} />;
}

export function CovieStatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={classes("covie-status-badge", className)}
      data-tone={tone}
    >
      {children}
    </span>
  );
}

export function CovieNotice({
  children,
  tone = "neutral",
  className,
  role,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  role?: "status" | "alert";
}) {
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      className={classes("covie-notice", className)}
      data-tone={tone}
    >
      {children}
    </div>
  );
}

export function CovieEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={classes("covie-empty-state", className)}>
      {icon ? <div className="covie-empty-state-icon">{icon}</div> : null}
      <h2 className="covie-empty-state-title">{title}</h2>
      <p className="covie-empty-state-description">{description}</p>
      {action ? <div className="covie-empty-state-action">{action}</div> : null}
    </div>
  );
}


type DialogTone = "coral" | "teal" | "sunshine" | "violet";

export function CovieDialog({
  id,
  title,
  description,
  icon,
  iconTone = "violet",
  size = "md",
  busy = false,
  onClose,
  children,
  footer,
  bodyClassName,
  dialogRef,
  closeButtonRef,
  describedBy,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  iconTone?: DialogTone;
  size?: "sm" | "md" | "lg";
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
  dialogRef?: Ref<HTMLElement>;
  closeButtonRef?: Ref<HTMLButtonElement>;
  describedBy?: string;
}) {
  return (
    <div className="covie-dialog-backdrop">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        aria-describedby={describedBy}
        aria-busy={busy || undefined}
        tabIndex={-1}
        className={classes(
          "covie-dialog",
          `covie-dialog-${size}`,
          "covie-dialog-fit",
        )}
      >
        <header className="covie-dialog-header">
          <div className="covie-dialog-heading">
            {icon ? (
              <div className={classes("covie-dialog-icon", iconTone)}>{icon}</div>
            ) : null}
            <div className="min-w-0">
              <h2 id={id} className="covie-dialog-title">
                {title}
              </h2>
              {description ? (
                <div className="covie-dialog-description">{description}</div>
              ) : null}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
            className="covie-dialog-close"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={classes("covie-dialog-body", bodyClassName)}>
          {children}
        </div>

        {footer ? <footer className="covie-dialog-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function CovieConfirmDialog({
  open,
  id,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  destructive = true,
  icon,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  id: string;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  destructive?: boolean;
  icon?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <CovieDialog
      id={id}
      title={title}
      description={description}
      icon={icon}
      iconTone={destructive ? "coral" : "sunshine"}
      size="sm"
      busy={busy}
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="covie-dialog-secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={destructive ? "covie-dialog-danger" : "covie-dialog-primary"}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-6 text-[#526168]">
        This action cannot be undone once it has been applied.
      </p>
    </CovieDialog>
  );
}
