import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Director of Studies",
};

export default function TermsPage() {
  return (
    <main className="prose prose-invert mx-auto max-w-3xl py-8">
      <h1>Terms of Service</h1>
      <p className="text-sm text-slate-400">Last updated: 1 March 2026</p>

      <h2>1. Definitions</h2>
      <p>
        <strong>&ldquo;Director of Studies&rdquo;</strong> (also &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;)
        refers to the AI-powered tutoring platform operated by Director of Studies Ltd.
      </p>
      <p>
        <strong>&ldquo;Service&rdquo;</strong> refers to the voice-based AI tutoring sessions, dashboard,
        calendar, and any associated features accessible through our web application.
      </p>
      <p>
        <strong>&ldquo;User&rdquo;</strong> refers to any student, parent, or guardian who registers for
        and uses the Service.
      </p>

      <h2>2. Eligibility and Accounts</h2>
      <p>
        Users must be at least 13 years of age to create an account. Students under 13 require
        a parent or guardian to create a parent account and provide verifiable consent before the
        student account is activated. See our <a href="/privacy">Privacy Policy</a> for details on
        how we handle children&apos;s data under UK GDPR and the Age Appropriate Design Code.
      </p>
      <p>
        You are responsible for maintaining the confidentiality of your account credentials and for
        all activity that occurs under your account.
      </p>

      <h2>3. Use of the Service</h2>
      <p>
        The Service is designed to supplement — not replace — classroom teaching. AI-generated
        content is provided for educational purposes only. While we strive for accuracy, we do not
        guarantee that all information provided by the AI tutor is correct.
      </p>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any purpose other than legitimate educational study</li>
        <li>Attempt to circumvent usage limits, parental controls, or access restrictions</li>
        <li>Share your account credentials with others</li>
        <li>Upload harmful, offensive, or illegal content</li>
        <li>Attempt to reverse-engineer or interfere with the Service</li>
      </ul>

      <h2>4. Subscriptions and Payments</h2>
      <p>
        Paid plans are billed through Stripe. Subscriptions auto-renew unless cancelled before the
        end of the billing period. Credit packs do not expire. Free starter credits are non-transferable.
        Refunds are handled in accordance with UK consumer protection law.
      </p>

      <h2>5. Data and Privacy</h2>
      <p>
        We collect and process personal data as described in our <a href="/privacy">Privacy Policy</a>.
        Session transcripts, summaries, and progress data are stored to provide the tutoring service and
        are accessible only to the student and any linked parent/guardian accounts.
      </p>

      <h2>6. Intellectual Property</h2>
      <p>
        All content, software, and materials provided through the Service are owned by or licensed to
        Director of Studies Ltd. Educational content is derived from publicly available exam board
        specifications and study materials, appropriately attributed.
      </p>

      <h2>7. Limitation of Liability</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; without warranty. We are not liable for any examination
        results, academic outcomes, or decisions made based on information provided by the AI tutor.
        Our total liability to any User shall not exceed the amount paid by that User in the
        preceding 12 months.
      </p>

      <h2>8. Termination</h2>
      <p>
        You may delete your account at any time from your settings page. We may suspend or terminate
        accounts that violate these terms. Upon termination, your data will be handled in accordance
        with our Privacy Policy and GDPR obligations.
      </p>

      <h2>9. Changes to These Terms</h2>
      <p>
        We may update these terms from time to time. Material changes will be communicated via email
        or an in-app notification. Continued use of the Service after changes take effect constitutes
        acceptance of the revised terms.
      </p>

      <h2>10. Governing Law</h2>
      <p>
        These terms are governed by the laws of England and Wales. Disputes shall be subject to the
        exclusive jurisdiction of the courts of England and Wales.
      </p>

      <h2>11. Contact</h2>
      <p>
        For questions about these terms, please contact us at{" "}
        <a href="mailto:legal@directorofstudies.co.uk">legal@directorofstudies.co.uk</a>.
      </p>
    </main>
  );
}
