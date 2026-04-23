import { LegalPageShell } from "@/app/_components/LegalPageShell";
import { SUPPORT_EMAIL } from "@/lib/contact";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy">
      <p className="text-xs text-neutral-500">
        Effective Date: April 23, 2026 · Last Updated: April 23, 2026
      </p>

      <p>
        InnerVerse is in active development. This page explains what data the
        app handles and how.
      </p>

      <Section title="What We Collect">
        <ul className="ml-5 list-disc space-y-1">
          <li>Account information: first name and email address</li>
          <li>
            Onboarding answers: coaching focus areas, goals, preferred coaching
            style, and chosen coach name
          </li>
          <li>Messages you write to the coach and the coach&apos;s responses</li>
          <li>
            Session-end analysis: summaries, breakthroughs, insights, and next
            steps generated from your sessions
          </li>
          <li>
            Session feedback: 1-5 ratings and optional written reflection
          </li>
          <li>
            Standard device and log data: IP address, browser type, basic usage
            patterns, error reports
          </li>
        </ul>
      </Section>

      <Section title="How We Use Your Data">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            To provide coaching sessions and remember context from prior
            sessions
          </li>
          <li>
            To improve prompts, analysis quality, and the overall user
            experience
          </li>
          <li>
            To keep the service running (authentication, error tracking,
            debugging)
          </li>
        </ul>
      </Section>

      <Section title="Third-Party Services">
        InnerVerse relies on:
        <ul className="ml-5 mt-2 list-disc space-y-1">
          <li>Clerk for account authentication</li>
          <li>
            Supabase (Postgres) for storing your account data, sessions, and
            messages
          </li>
          <li>
            OpenAI for generating coaching responses and session-end analysis
          </li>
          <li>Vercel for web hosting</li>
          <li>Sentry for error tracking</li>
        </ul>
        <p className="mt-3">
          Your data may transit through or be stored in the United States via
          these services.
        </p>
      </Section>

      <Section title="Cookies">
        We use cookies for login and basic functionality. Your browser&apos;s
        cookie settings let you control them.
      </Section>

      <Section title="Your Rights">
        You can request access to your data, corrections to inaccurate data, or
        deletion of your account and all associated data at any time.
      </Section>

      <Section title="Children">
        We do not knowingly collect data from anyone under 13. If you think a
        child has created an account, contact us.
      </Section>

      <Section title="Security">
        We use standard authentication, transport encryption, and row-level
        database security. No online service is perfectly secure.
      </Section>

      <Section title="Changes">
        We may update this policy as the app evolves.
      </Section>

      <Section title="Contact">
        Privacy questions or data requests:{" "}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-brand-primary underline"
        >
          {SUPPORT_EMAIL}
        </a>
      </Section>
    </LegalPageShell>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-white">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
