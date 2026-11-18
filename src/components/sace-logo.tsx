import * as React from "react";
import { cn } from "@/lib/utils";

interface SaceLogoProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "badge" | "horizontal" | "full" | "wordmark";
  theme?: "purple" | "white" | "adaptive";
}

export function SaceLogo({
  className,
  size = "md",
  variant = "horizontal",
  theme = "adaptive",
  ...props
}: SaceLogoProps) {
  const sizeClasses = {
    sm: "h-7",
    md: "h-9",
    lg: "h-12",
    xl: "h-16",
  }[size];

  // Official uploaded SACE Group logo asset (purple logo)
  const logoSrc = "/assets/aistudio/SACE_Group_Logo_e04b9e3b.png";

  if (variant === "wordmark") {
    return (
      <div
        className={cn(
          "inline-flex items-center bg-white px-3 py-1.5 rounded-xl shadow-xs",
          sizeClasses,
          className,
        )}
        {...props}
      >
        <img src={logoSrc} alt="SACE Group Logo" className="h-full w-auto object-contain" />
      </div>
    );
  }

  if (variant === "badge") {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-xl bg-white p-2 shadow-md ring-1 ring-border",
          sizeClasses,
          "aspect-video",
          className,
        )}
        {...props}
      >
        <img src={logoSrc} alt="SACE Group" className="h-full w-full object-contain" />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)} {...props}>
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-xl bg-white px-3 py-1.5 shadow-md shadow-black/5 ring-1 ring-border",
          sizeClasses,
          "shrink-0",
        )}
      >
        <img src={logoSrc} alt="SACE Group" className="h-full w-auto object-contain" />
      </div>
      <span className="font-bold tracking-tight text-foreground text-base">WORKPULSE</span>
    </div>
  );
}
