"use client";

import { SignOutButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f0f2f7] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="hidden w-60 shrink-0 border-r border-slate-700 bg-[#0d1b36] px-4 py-5 text-slate-100 md:flex md:flex-col">
          <Link href="/agent" className="block px-2">
            <p className="text-xl font-bold tracking-tight text-white">JobPulse</p>
            <p className="mt-0.5 text-[11px] text-blue-300/80">AI Job Search Agent</p>
          </Link>

          <nav className="mt-8 space-y-1">
            <SidebarItem href="/agent" label="Agent" icon="🤖" />
            <SidebarItem href="/agent/approvals" label="Pending Approvals" icon="📬" />
            <SidebarItem href="/agent/applications" label="Applications" icon="📋" />
            <SidebarItem href="/agent/settings" label="Agent Settings" icon="⚙️" />
          </nav>

          <div className="mt-auto pt-4 border-t border-slate-700/60">
            <div className="flex items-center gap-2 px-2 py-1">
              <UserButton />
              <span className="text-xs text-slate-400">Account</span>
            </div>
            <SignOutButton>
              <button
                type="button"
                className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                Sign out
              </button>
            </SignOutButton>
          </div>
        </aside>

        <div className="min-w-0 flex-1 flex flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}

function SidebarItem({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: string;
}) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const pathname = usePathname();
  const active = pathname === href || (href !== "/agent" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white shadow-sm"
          : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      {label}
    </Link>
  );
}
