import { Principles } from "@/components/landing/principles";
import { WorkflowPreview } from "@/components/landing/workflow-preview";
import { SiteHeader } from "@/components/site-header";
import { siteConfig } from "@/lib/site";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
          <div className="flex flex-col gap-6">
            <p className="text-sm font-medium text-brand">
              Local-first file organization
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              {siteConfig.tagline}
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
              {siteConfig.description}
            </p>
            <Principles />
          </div>
          <WorkflowPreview />
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
          {siteConfig.name} is in early development. Folder scanning and AI
          suggestions are coming next.
        </div>
      </footer>
    </>
  );
}
