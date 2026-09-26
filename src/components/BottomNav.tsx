"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

function Icon({ name, active }: { name: string; active: boolean }) {
  const c = active ? "#4b4640" : "#9a8f76";
  const p = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: c, strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "home") return (<svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>);
  if (name === "pin") return (<svg {...p}><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" /><circle cx="12" cy="9" r="2.4" /></svg>);
  if (name === "gift") return (<svg {...p}><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M2.5 9h19M12 9v11" /><path d="M12 9S10.5 4 8 5s4 4 4 4Zm0 0s1.5-5 4-4-4 4-4 4Z" /></svg>);
  return (<svg {...p}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4.5M12 17.5h.01" /></svg>);
}

export default function BottomNav() {
  const path = usePathname();
  const { t } = useI18n();
  const items = [
    { href: "/", icon: "home", label: t("nav_home") },
    { href: "/spots", icon: "pin", label: t("nav_spots") },
    { href: "/rewards", icon: "gift", label: t("nav_rewards") },
    { href: "/notes", icon: "alert", label: t("nav_notes") },
  ];
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-[#F6C64B] border-t border-[#e6b53c] pb-safe">
      <div className="mx-auto max-w-md grid grid-cols-4">
        {items.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} className="flex flex-col items-center gap-0.5 py-2">
              <Icon name={it.icon} active={active} />
              <span className={`text-[11px] ${active ? "text-[#4b4640] font-bold" : "text-[#9a8f76]"}`}>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
