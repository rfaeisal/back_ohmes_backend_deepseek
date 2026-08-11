import React from "react";
import { cn } from "@/lib/utils";

const variantStyles: Record<string, string> = {
  success: "bg-green-100 text-green-800 border-green-300",
  warning: "bg-yellow-100 text-yellow-800 border-yellow-300",
  error: "bg-red-100 text-red-800 border-red-300",
  neutral: "bg-gray-100 text-gray-700 border-gray-300",
  info: "bg-blue-100 text-blue-800 border-blue-300",
  default: "bg-primary text-primary-foreground border-transparent",
  secondary: "bg-secondary text-secondary-foreground border-transparent",
  destructive: "bg-destructive/10 text-destructive border-transparent",
  outline: "border-border text-foreground",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: string;
  className?: string;
}

export function Badge({ children, variant = "neutral", className = "" }: BadgeProps) {
  const style = variantStyles[variant] ?? variantStyles.neutral;
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", style, className)}>
      {children}
    </span>
  );
}
