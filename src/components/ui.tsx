"use client";
import React from "react";

// ---- Button ----
type Variant = "primary" | "secondary" | "danger" | "ghost" | "dark";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition-colors " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-white " +
  "disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap select-none";

const variants: Record<Variant, string> = {
  primary: "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 focus-visible:ring-emerald-500 shadow-sm",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400 focus-visible:ring-slate-400",
  danger: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 focus-visible:ring-rose-500 shadow-sm",
  ghost: "text-slate-500 hover:text-slate-800 hover:bg-slate-100 focus-visible:ring-slate-300",
  dark: "bg-slate-800 text-white hover:bg-slate-900 focus-visible:ring-slate-500 shadow-sm",
};
const sizes: Record<Size, string> = {
  sm: "text-[13px] px-3 py-1.5",
  md: "text-sm px-4 py-2.5",
};

export function Button({
  variant = "primary", size = "md", className = "", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}

// ---- Inputs ----
const fieldBase =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 " +
  "placeholder:text-slate-400 shadow-sm transition " +
  "focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30";

export function TextInput({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldBase} ${className}`} {...props} />;
}
export function TextArea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${fieldBase} min-h-[80px] ${className}`} {...props} />;
}

export function Field({ label, hint, children, className = "" }:
  { label?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="block text-[13px] font-medium text-slate-700 mb-1">{label}</label>}
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

// ---- Card ----
export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

// ---- Segmented tabs ----
export function Segmented<T extends string>({ value, onChange, options }:
  { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              on ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---- Badge ----
export function Badge({ tone = "slate", children }: { tone?: "slate" | "emerald" | "amber" | "rose"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-700",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
