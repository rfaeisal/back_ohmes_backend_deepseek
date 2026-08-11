import React from "react";
import { cn } from "@/lib/utils";

interface CardProps { children: React.ReactNode; className?: string; highlight?: "none" | "yellow" | "green" | "red"; }

export function Card({ children, className = "", highlight = "none" }: CardProps) {
  const borderColors: Record<string, string> = {
    none: "ring-1 ring-foreground/10",
    yellow: "ring-2 ring-yellow-400 bg-yellow-50",
    green: "ring-2 ring-green-400 bg-green-50",
    red: "ring-2 ring-red-400 bg-red-50",
  };
  return (
    <div className={cn("flex flex-col gap-3 overflow-hidden rounded-xl bg-card py-4 px-4 text-sm text-card-foreground", borderColors[highlight], className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-base leading-snug font-medium", className)}>{children}</div>;
}

export function CardSubtitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}

export function CardContent({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("", className)}>{children}</div>;
}

export { CardTitle as CardHeader };
