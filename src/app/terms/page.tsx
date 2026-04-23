import { LegalPageShell } from "@/app/_components/LegalPageShell";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service">
      <p className="text-xs text-neutral-500">
        Effective Date: April 23, 2026 · Last Updated: April 23, 2026
      </p>

      <p>
        InnerVerse is an AI coaching application currently in active
        development. By using it you agree to the terms below.
      </p>

      <Section title="Eligibility">
        You must be at least 18 years old to use InnerVerse. Users aged 13 to
        17 may use the app only with the consent and supervision of a parent
        or guardian. InnerVerse is not for children under 13.
      </Section>

      <Section title="Your Account">
        When you create an account you are responsible for keeping your
        credentials safe and for anything that happens under your account.
        Notify us if you believe your account has been accessed without your
        permission.
      </Section>

      <Section title="Acceptable Use">
        Do not attempt to gain unauthorized access to the service. Do not
        redistribute or resell it. Do not use the service to transmit harmful,
        offensive, or illegal content.
      </Section>

      <Section title="Coaching Disclaimer">
        InnerVerse provides AI-generated coaching content for personal growth
        and self-reflection. It is not a substitute for professional therapy,
        medical treatment, or legal advice. You are responsible for how you
        choose to act on anything you discuss during a session.
      </Section>

      <Section title="Your Content">
        You own the messages and reflections you write. We store them to
        provide the service, including cross-session memory for future
        sessions. Anonymized, aggregate data may be used to improve the app.
      </Section>

      <Section title="Service Status">
        InnerVerse is in active development. Features may change, break, or
        be removed without notice. The service is provided &ldquo;as is&rdquo;
        and without warranty during this period.
      </Section>

      <Section title="Limitation of Liability">
        To the fullest extent permitted by law, we are not liable for indirect
        or consequential damages arising from your use of the service. Your
        remedy for dissatisfaction is to stop using the app.
      </Section>

      <Section title="Changes">
        We may update these terms as the app evolves. Continued use after
        changes take effect means you accept the revised terms.
      </Section>

      <Section title="Contact">
        Questions:{" "}
        <a
          href="mailto:hello@mastersofbadassery.com"
          className="text-brand-primary underline"
        >
          hello@mastersofbadassery.com
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
      <p>{children}</p>
    </section>
  );
}
