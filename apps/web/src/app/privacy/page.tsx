import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Director of Studies",
};

export default function PrivacyPage() {
  return (
    <main className="prose prose-invert mx-auto max-w-3xl py-8">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-slate-400">Last updated: 1 March 2026</p>

      <h2>1. Who We Are</h2>
      <p>
        studysesh ltd. (trading as <strong>Director of Studies</strong>, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;)
        is the data controller for personal data collected through our AI tutoring platform at{" "}
        <a href="https://directorofstudies.com">directorofstudies.com</a>.
        We are registered in England and Wales (Company No. 16860469).
      </p>
      <p>
        Contact: <a href="mailto:privacy@directorofstudies.com">privacy@directorofstudies.com</a>
      </p>

      <h2>2. Data We Collect</h2>
      <h3>Account Data</h3>
      <ul>
        <li>Name, email address, date of birth, school year</li>
        <li>Account type (student or parent/guardian)</li>
        <li>Parent–student linking information</li>
      </ul>

      <h3>Usage Data</h3>
      <ul>
        <li>Session transcripts and AI-generated summaries</li>
        <li>Progress snapshots and areas for improvement</li>
        <li>Subject enrolments and exam board selections</li>
        <li>Calendar and scheduling data</li>
      </ul>

      <h3>Technical Data</h3>
      <ul>
        <li>Browser type, operating system, and IP address</li>
        <li>Session timestamps and duration</li>
        <li>Authentication tokens (managed by Supabase)</li>
      </ul>

      <h2>3. How We Use Your Data</h2>
      <p>We process your data for the following purposes:</p>
      <ul>
        <li><strong>Providing the Service:</strong> delivering AI tutoring sessions, tracking progress,
          generating summaries and recommendations</li>
        <li><strong>Account management:</strong> authentication, billing, parent–student linking</li>
        <li><strong>Improvement:</strong> analysing usage patterns to improve the AI tutor and
          educational content (anonymised and aggregated)</li>
        <li><strong>Legal obligations:</strong> safeguarding, parental consent verification,
          responding to data subject requests</li>
      </ul>

      <h2>4. Legal Basis for Processing</h2>
      <table>
        <thead>
          <tr><th>Purpose</th><th>Legal Basis (UK GDPR)</th></tr>
        </thead>
        <tbody>
          <tr><td>Providing the tutoring service</td><td>Performance of a contract (Art. 6(1)(b))</td></tr>
          <tr><td>Account security and fraud prevention</td><td>Legitimate interests (Art. 6(1)(f))</td></tr>
          <tr><td>Parental consent for under-13s</td><td>Consent (Art. 6(1)(a), Art. 8)</td></tr>
          <tr><td>Legal and safeguarding obligations</td><td>Legal obligation (Art. 6(1)(c))</td></tr>
          <tr><td>Service improvement (anonymised)</td><td>Legitimate interests (Art. 6(1)(f))</td></tr>
        </tbody>
      </table>

      <h2>5. Children&apos;s Data</h2>
      <p>
        We take the protection of children&apos;s data seriously. Students under 13 cannot use the
        Service without verified parental consent. We comply with the UK Age Appropriate Design Code
        (Children&apos;s Code) and process children&apos;s data with the highest level of protection.
      </p>
      <p>
        Parent/guardian accounts can view their linked student&apos;s progress data, control usage
        limits, and request deletion of the student&apos;s account and data.
      </p>

      <h2>6. Data Retention</h2>
      <ul>
        <li><strong>Active accounts:</strong> data retained while the account is active</li>
        <li><strong>Deleted accounts:</strong> personal data is soft-deleted and fully
          purged within 30 days of account deletion</li>
        <li><strong>Session transcripts:</strong> retained for up to 12 months after the
          session, then anonymised or deleted</li>
        <li><strong>Billing data:</strong> retained as required by UK tax and financial regulations
          (typically 6 years)</li>
      </ul>

      <h2>7. Data Sharing</h2>
      <p>We share personal data only with:</p>
      <ul>
        <li><strong>Supabase:</strong> authentication and database hosting (EU servers)</li>
        <li><strong>Stripe:</strong> payment processing (PCI DSS compliant)</li>
        <li><strong>OpenAI:</strong> AI model provider for tutoring sessions (data processing agreement in place)</li>
        <li><strong>Deepgram:</strong> speech-to-text and text-to-speech processing</li>
      </ul>
      <p>We do not sell personal data to third parties.</p>

      <h2>8. Your Rights (UK GDPR)</h2>
      <p>You have the right to:</p>
      <ul>
        <li><strong>Access</strong> your personal data (Subject Access Request)</li>
        <li><strong>Rectify</strong> inaccurate data via your settings page</li>
        <li><strong>Erase</strong> your data (&ldquo;right to be forgotten&rdquo;) via account deletion</li>
        <li><strong>Restrict</strong> processing in certain circumstances</li>
        <li><strong>Data portability</strong> — receive your data in a machine-readable format</li>
        <li><strong>Object</strong> to processing based on legitimate interests</li>
        <li><strong>Withdraw consent</strong> at any time where consent is the legal basis</li>
      </ul>
      <p>
        To exercise any of these rights, contact{" "}
        <a href="mailto:privacy@directorofstudies.com">privacy@directorofstudies.com</a>.
        We will respond within one month as required by UK GDPR.
      </p>

      <h2>9. Cookies</h2>
      <p>
        We use essential cookies for authentication and session management. Analytics cookies (if enabled)
        are only set with your consent. You can manage your cookie preferences at any time using the
        cookie settings accessible from the footer of every page.
      </p>

      <h2>10. Security</h2>
      <p>
        We implement appropriate technical and organisational measures to protect your data, including
        encryption in transit (TLS), encrypted database connections, and access controls. We regularly
        review our security practices.
      </p>

      <h2>11. International Transfers</h2>
      <p>
        Some of our data processors (OpenAI, Deepgram) are based in the United States. These transfers
        are protected by appropriate safeguards including Standard Contractual Clauses and data processing
        agreements.
      </p>

      <h2>12. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Material changes will be communicated via
        email. The &ldquo;Last updated&rdquo; date at the top indicates when this policy was last revised.
      </p>

      <h2>13. Complaints</h2>
      <p>
        If you are not satisfied with how we handle your data, you have the right to lodge a complaint
        with the Information Commissioner&apos;s Office (ICO) at{" "}
        <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">ico.org.uk</a>.
      </p>
    </main>
  );
}
