import Link from "next/link";

import { LegalPageShell } from "@/app/_components/LegalPageShell";

export const metadata = { title: "Support" };

export default function SupportPage() {
  return (
    <LegalPageShell title="Support">
      <p>
        InnerVerse is in active development. Here is how to get help.
      </p>

      <Section title="Can’t log in">
        Check that you are using the correct email address. If you need to
        reset your password, use the &ldquo;Forgot Password&rdquo; option on
        the sign-in page.
      </Section>

      <Section title="Something is not working">
        If a session will not start, messages are not streaming, or you see
        unexpected behavior, email us a short description of what you were
        doing. Screenshots help.
      </Section>

      <Section title="Delete your account or data">
        Email us and we will remove your account and all associated data.
      </Section>

      <Section title="Coaching Disclaimer">
        InnerVerse provides AI-powered coaching for personal growth. It is
        not therapy, medical treatment, or legal advice.
      </Section>

      <Section title="Legal">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <Link href="/terms" className="text-brand-primary underline">
              Terms of Service
            </Link>
          </li>
          <li>
            <Link href="/privacy" className="text-brand-primary underline">
              Privacy Policy
            </Link>
          </li>
        </ul>
      </Section>

      <Section title="Contact">
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
      <div>{children}</div>
    </section>
  );
}
