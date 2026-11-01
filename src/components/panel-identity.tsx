import { useState } from "react";
import { panelDisplayName } from "@/lib/panel-branding";
export function PanelIdentity({
  name,
  logoUrl,
}: {
  name?: string | null | undefined;
  logoUrl?: string | null | undefined;
}) {
  const label = panelDisplayName(name);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2" title={label}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
        {logoUrl && failedUrl !== logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 bg-white object-contain"
            onError={() => setFailedUrl(logoUrl)}
          />
        ) : (
          label.slice(0, 1).toLocaleUpperCase("es-CL")
        )}
      </span>
      <span className="min-w-0 break-words font-display text-base font-bold leading-tight">
        {label}
      </span>
    </span>
  );
}
