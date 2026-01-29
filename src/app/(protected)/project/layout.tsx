"use client";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Project has its own header, so we don't show the main navbar
  return (
    <div className="h-screen bg-slate-50 text-slate-900 flex flex-col font-sans overflow-hidden">
      {children}
    </div>
  );
}
