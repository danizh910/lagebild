import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-xl" aria-label="lagebild – zur Startseite">
      <span className="grid size-8 place-items-center rounded-[10px] bg-blue">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
      </span>
      <span className="text-xl font-extrabold tracking-[-0.03em]">lagebild</span>
    </Link>
  );
}

/** Glass pill header. `children` go to the right, `middle` sits between logo and actions. */
export function SiteHeader({ children, middle }: { children?: React.ReactNode; middle?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white bg-[var(--glass)] py-2 pl-5 pr-2 backdrop-blur-md">
      <Logo />
      {middle}
      <div className="flex min-h-11 items-center gap-2">{children}</div>
    </header>
  );
}
