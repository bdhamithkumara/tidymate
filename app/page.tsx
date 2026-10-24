import { Principles } from "@/components/landing/principles";
import { WorkflowPreview } from "@/components/landing/workflow-preview";
import { FolderScanner } from "@/components/scanner/folder-scanner";
import { SiteHeader } from "@/components/site-header";
import { siteConfig } from "@/lib/site";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
          <section className="flex max-w-3xl flex-col gap-5">
            <p className="text-sm font-medium text-brand">
              Local-first file organization
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {siteConfig.tagline}
            </h1>
            <p className="text-lg leading-relaxed text-pretty text-muted-foreground">
              {siteConfig.description}
            </p>
            <Principles />
          </section>

          <section aria-label="Scan a folder">
            <FolderScanner aside={<WorkflowPreview />} />
          </section>
        </div>
      </main>
      <footer className="border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
          {siteConfig.name} is in early development. Scanning is read-only; AI
          suggestions are coming next.
        </div>
      </footer>
    </>
  );
}
