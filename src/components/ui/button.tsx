"use client";

import React from "react";
import { Button as ShadcnButton } from "@base-ui/react/button";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent",
        danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90 border-transparent",
        outline: "border-border bg-background hover:bg-muted hover:text-foreground",
        ghost: "border-transparent hover:bg-muted hover:text-foreground",
      },
      size: {
        sm: "h-7 gap-1 rounded-lg px-2.5 text-xs",
        md: "h-8 gap-1.5 px-3 text-sm",
        lg: "h-9 gap-1.5 px-4 text-base",
        xl: "h-11 gap-2 px-6 text-lg",
        operator: "h-[88px] gap-2 px-8 text-2xl font-bold",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "danger" | "outline" | "ghost";
  size?: "sm" | "md" | "lg" | "xl" | "operator";
  children: React.ReactNode;
}

export function Button({ variant = "primary", size = "md", className, children, disabled, ...props }: ButtonProps) {
  return (
    <ShadcnButton
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled}
      {...(props as any)}
    >
      {children}
    </ShadcnButton>
  );
}

export { buttonVariants };
