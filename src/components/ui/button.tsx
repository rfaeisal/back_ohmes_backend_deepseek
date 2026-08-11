import React from "react";

type ButtonVariant = "primary" | "danger" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg" | "xl" | "operator";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-300",
  danger: "bg-red-700 text-white hover:bg-red-800 focus:ring-red-300",
  outline: "border-2 border-gray-300 text-gray-700 hover:bg-gray-100 focus:ring-gray-300",
  ghost: "text-gray-600 hover:bg-gray-100 focus:ring-gray-300",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm rounded-md",
  md: "px-5 py-2.5 text-base rounded-lg",
  lg: "px-6 py-3 text-lg rounded-lg",
  xl: "px-8 py-4 text-xl rounded-xl",
  operator: "px-8 py-6 text-2xl rounded-xl min-h-[88px] font-bold",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-semibold transition-colors focus:outline-none focus:ring-4 disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
