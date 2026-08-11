import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  highlight?: "none" | "yellow" | "green" | "red";
}

export function Card({ children, className = "", highlight = "none" }: CardProps) {
  const borderColors = {
    none: "border-gray-200",
    yellow: "border-yellow-400 bg-yellow-50",
    green: "border-green-400 bg-green-50",
    red: "border-red-400 bg-red-50",
  };

  return (
    <div
      className={`rounded-xl border-2 ${borderColors[highlight]} bg-white p-6 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={`text-lg font-bold text-gray-900 mb-1 ${className}`}>
      {children}
    </h3>
  );
}

export function CardSubtitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-sm text-gray-500 ${className}`}>{children}</p>
  );
}
