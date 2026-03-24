import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f6f8fc] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px]">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-[#0f1f45] px-4 py-5 text-slate-100 md:block">
          <Link href="/dashboard" className="block px-2">
            <p className="text-xl font-semibold tracking-tight">Handled</p>
            <p className="mt-1 text-xs text-slate-300/80">JobPulse analytics</p>
          </Link>
          <nav className="mt-8 space-y-1.5">
            <SidebarItem href="/dashboard" label="Dashboard" active />
            <SidebarItem href="/dashboard" label="Pipeline" />
            <SidebarItem href="/dashboard" label="Insights" />
            <SidebarItem href="/dashboard" label="Settings" />
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="flex h-14 items-center justify-between px-5 md:px-8">
              <div>
                <p className="text-sm font-semibold tracking-tight text-slate-800">Your dashboard</p>
                <p className="text-[11px] text-slate-500">Measure pipeline activity and execution KPIs</p>
              </div>
              <UserButton />
            </div>
          </header>
          <main className="px-5 py-6 md:px-8 md:py-7">{children}</main>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center rounded-md px-3 py-2 text-sm transition ${
        active
          ? "bg-blue-500/20 text-white"
          : "text-slate-200/90 hover:bg-white/10 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}
