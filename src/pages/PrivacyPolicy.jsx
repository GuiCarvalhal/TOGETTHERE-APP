import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import BrandLogo from '@/components/tt/BrandLogo';

// Public, crawler-readable privacy policy. Rendered as normal HTML text (no
// PDF, no iframe) so Google's OAuth verification can read the full policy, and
// mounted OUTSIDE the authenticated area so it is reachable signed-out.

const EFFECTIVE_DATE = 'November 5, 2026';
const LAST_UPDATED = 'November 5, 2026';

// Single place to change the published contact route for privacy requests.
const CONTACT_EMAIL = 'admin@togetthere.app';

const GOOGLE_USER_DATA_POLICY =
  'https://developers.google.com/terms/api-services-user-data-policy';

const SECTIONS = [
  {
    id: 'scope',
    title: '1. Scope of this policy',
    blocks: [
      { text: `This Privacy Policy explains how TOGETTHERE ("TOGETTHERE", "we", "us") collects, accesses, uses, stores, shares, protects and deletes information when you use the TOGETTHERE application and website at https://togetthere.app (the "Service"), including when you choose to connect an email mailbox such as Gmail, Microsoft Outlook, Yahoo Mail or iCloud Mail.` },
      { text: `It applies to every part of the Service and forms part of our agreement with you. By creating an account or continuing to use the Service you confirm you have read this policy.` },
    ],
  },
  {
    id: 'who-we-are',
    title: '2. Who we are',
    blocks: [
      { text: `TOGETTHERE is a group travel and gatherings service that keeps a shared itinerary, expense splitting, trip members and an AI travel concierge in one place. For the purposes of applicable data protection law, TOGETTHERE is the controller of the personal information described here, and the Service is operated on infrastructure and platform services provided by our hosting and processing partners (see section 6).` },
    ],
  },
  {
    id: 'data-we-collect',
    title: '3. Information we collect and access',
    blocks: [
      { lead: 'Account information.', text: 'When you sign up or sign in with email and password or with a third-party identity provider (including Google), we receive identifiers and profile data made available by that provider, such as your name, email address and profile photo. We never receive or store your Google or other provider password.' },
      { lead: 'Content you create.', text: 'Gatherings, itinerary segments (flights, stays, rides, activities), notes, expenses and splits, member invitations and the travel preferences you add, including photos and files you upload.' },
      { lead: 'Connected email mailboxes.', text: 'If you connect a mailbox, we access the messages needed to find travel reservations. For a Google account this uses the restricted Gmail read-only scope (https://www.googleapis.com/auth/gmail.readonly). We read message headers (sender, subject, date) and the message body only for messages that appear to be bookings; other messages are not downloaded or stored. We store the booking details we extract, a copy of the source email for that booking, and the mailbox address. Access tokens and refresh tokens are stored server-side only and are never returned to your browser.' },
      { lead: 'Connected financial accounts.', text: 'If you connect a bank or card account or import a statement, we receive transaction descriptions, amounts, currencies and dates, plus the account name and the last four digits of the account number. We never collect or store a full account or card number, and we never receive your banking credentials.' },
      { lead: 'Places, maps and photos.', text: 'Place names, addresses and coordinates you select or that we resolve for your itinerary, and the photos we display for those places.' },
      { lead: 'Device, notification and technical data.', text: 'A push-notification subscription identifier if you enable notifications, your language and theme preferences, and limited diagnostic and usage events needed to operate and secure the Service (for example errors and sign-in events).' },
    ],
  },
  {
    id: 'how-we-use',
    title: '4. How we use information',
    blocks: [
      { text: 'We use information only to deliver the features you ask for, and to keep the Service secure and working:' },
      {
        list: [
          'Create and secure your account and sign you in.',
          'Build, display and share the itinerary and member information inside the gatherings you belong to.',
          'Calculate expenses, splits and balances between members and families.',
          'Find reservations in a connected mailbox and turn them into itinerary items, and alert you about upcoming bookings when you enable reminders.',
          'Provide the AI concierge: suggestions for a gathering, and extraction of booking details from a specific reservation email.',
          'Resolve places, maps, flight status and currency conversion used on the screens you open.',
          'Send notifications and service emails you have requested, such as reminders or an access confirmation.',
          'Detect abuse, prevent fraud and maintain availability.',
        ],
      },
      { text: 'We do not use information for advertising, we do not build advertising or profiling audiences, and we do not send promotional email unless you ask for it. We do not use Google user data for any purpose other than providing the user-facing features described above.' },
    ],
  },
  {
    id: 'google-user-data',
    title: "5. Google API Services User Data — our commitments",
    blocks: [
      { text: `TOGETTHERE's use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements (${GOOGLE_USER_DATA_POLICY}).` },
      { lead: 'How Google user data is accessed.', text: 'Only after you explicitly connect a Google account, and only with the read-only scopes needed for the feature you requested (sign-in identity, and Gmail read-only for reservation import).' },
      { lead: 'How Google user data is used.', text: 'Solely to provide and improve the user-facing features you requested — importing your travel reservations into your itinerary and showing them to the members of the gathering you filed them into. A reservation email is processed by an AI model provider acting as our processor, only to extract the booking fields for that one segment; it is not used by us or by that processor to train generalized models.' },
      { lead: 'How Google user data is stored and protected.', text: 'Server-side only, in access-controlled storage. OAuth tokens never reach the browser and are not exposed to other users of the Service.' },
      { lead: 'How Google user data is shared.', text: 'It is not shared with third parties except the processors needed to run the feature (hosting, AI extraction for the email being processed, and push notifications for a reminder you enabled), or where legally required.' },
      { lead: 'How Google user data is retained and deleted.', text: 'Reservation items and their source emails are kept while the item exists and, if deleted, for the 30-day recovery window described in section 8; disconnecting the mailbox deletes the stored tokens immediately and stops all further access. You can request deletion of all Google-derived data at any time (section 9).' },
      { text: 'Specifically, with respect to Google user data we commit that we will NOT:' },
      {
        list: [
          'Use Google user data for targeted, personalised or retargeted advertising, or for advertising measurement.',
          'Sell Google user data, or rent, license or otherwise make it available for value.',
          'Transfer Google user data to data brokers, resellers, information aggregators or similar third parties.',
          'Use Google Workspace or Google API data to develop, train, fine-tune or improve generalized or non-personalized artificial intelligence or machine learning models.',
          'Allow humans to read Google user data, except where you gave your affirmative consent for a specific message, where it is necessary for security or abuse investigations, or where required by law.',
        ],
      },
    ],
  },
  {
    id: 'sharing',
    title: '6. How we share information',
    blocks: [
      { text: 'We do not sell personal information and we do not share it for cross-context behavioural advertising. Information is disclosed only in these situations:' },
      {
        list: [
          'Other members of a gathering, who see the itinerary segments, expenses and member details that belong to that gathering. Private notes you mark as private are not shown to them.',
          'Service providers acting as our processors under contract and only on our instructions: cloud hosting and database services, file storage, transactional email delivery, push notification delivery, AI model inference for the extraction and suggestion features, mapping and place data, flight data and currency exchange rates.',
          'Legal obligations: where we believe in good faith that disclosure is required by law, regulation, subpoena or other valid legal process, or is necessary to protect the rights, safety or property of our users or of TOGETTHERE.',
          'Business transfers: if the Service is merged, acquired or its assets transferred, information may be transferred as part of that transaction, subject to this policy and to notice to you.',
        ],
      },
      { text: 'We require every processor to protect information to standards at least equivalent to this policy, to use it only for the purposes we specify, and to delete it when our relationship ends.' },
    ],
  },
  {
    id: 'security',
    title: '7. How we protect information',
    blocks: [
      { text: 'We apply technical and organisational measures designed to protect information against loss, misuse and unauthorised access:' },
      {
        list: [
          'Encryption in transit: all traffic between your device and the Service, and between the Service and provider APIs, uses HTTPS/TLS.',
          'Access control and least privilege: records are scoped per gathering and per account by server-side access rules, and privileged operations run only through server-side checks. One user cannot read another user\'s gatherings, mailbox content or financial data.',
          'Credential isolation: mailbox and bank OAuth tokens are stored server-side only, never exposed to the browser or to other users. App-specific passwords for password-based mailbox providers are encrypted at rest with AES-GCM using a dedicated key that is rotated.',
          'Minimisation: we read only the messages that look like bookings, keep only the booking details and the source email, and never request write, send or delete access to a mailbox.',
          'Monitoring and review: errors, failed syncs and sign-in events are logged and reviewed, and secrets are stored in a managed secret store rather than in code.',
        ],
      },
      { text: 'No method of transmission or storage is completely secure. If we become aware of a breach affecting your information, we will notify you and any relevant authority as required by applicable law.' },
    ],
  },
  {
    id: 'retention',
    title: '8. Retention and deletion',
    blocks: [
      { text: 'We keep personal information only as long as needed for the purposes in this policy:' },
      {
        list: [
          'Account and profile data: until you delete your account or ask us to delete it.',
          'Gathering content (itinerary, expenses, splits, notes, attachments): while the gathering exists. You can delete individual items at any time.',
          'Deleted items: itinerary segments and expenses are soft-deleted and remain recoverable in "Recently deleted" for 30 days, after which they are permanently purged. The same 30-day window applies to a reservation email kept as the source attachment of an imported segment.',
          'Connected mailbox tokens and sync cursors: kept while the mailbox is connected. Disconnecting deletes the tokens immediately and stops all access and syncing; already-imported itinerary items stay until you delete them.',
          'Connected financial data: transaction records are kept while the connection or statement import exists; disconnecting stops syncing and lets you remove the connection and its data.',
          'Diagnostic logs: kept for a limited period for security and operations, then deleted or aggregated.',
        ],
      },
      { text: 'When you ask us to delete your account, we delete the associated personal information within 30 days, except where we must keep specific records to comply with a legal obligation, resolve a dispute or prevent fraud, and except for copies still held in routine encrypted backups until they age out.' },
    ],
  },
  {
    id: 'your-rights',
    title: '9. Your rights, controls and choices',
    blocks: [
      { text: 'You stay in control of your information and can exercise the following at any time:' },
      {
        list: [
          'Disconnect a mailbox: Account → connected inboxes → Disconnect. Stored tokens are deleted immediately and no further messages are read.',
          'Disconnect a financial account: Account → financial connections → Disconnect.',
          'Edit or delete content: change or remove itinerary items, expenses, notes, attachments and member details directly in the app, and restore an accidental deletion from "Recently deleted" within 30 days.',
          'Withdraw notification consent: turn off push notifications or individual notification categories in your notification settings, or in your device settings.',
          'Access and portability: request a copy of the personal information we hold about you, and export of your itinerary and expense data.',
          'Correction: request correction of inaccurate information.',
          'Deletion: request deletion of your account and the information associated with it.',
          'Objection and restriction: object to or ask us to restrict a specific use, and withdraw any consent you previously gave.',
          'Complaint: lodge a complaint with your local data protection authority. We ask that you contact us first so we can try to resolve it.',
        ],
      },
      { lead: 'Contact route for rights requests.', text: `Email ${CONTACT_EMAIL} from the address associated with your account, stating what you want us to do. We may ask you to verify that you control the account before acting. We respond within the timeframe required by applicable law, normally within 30 days.` },
    ],
  },
  {
    id: 'transfers',
    title: '10. International data transfers',
    blocks: [
      { text: 'The Service is operated on infrastructure located in the United States and the European Union, and our processors may store or process information in other countries. Where information protected by the GDPR or comparable law is transferred outside its region of origin, we rely on appropriate safeguards — in particular the European Commission Standard Contractual Clauses and, where applicable, the UK International Data Transfer Addendum — together with supplementary technical measures such as encryption in transit and at rest. You can request more information about these safeguards using the contact route in section 13.' },
    ],
  },
  {
    id: 'children',
    title: '11. Children',
    blocks: [
      { text: 'The Service is not intended for children under 16, and we do not knowingly collect personal information from them. If you believe a child has provided us information, contact us and we will delete it.' },
    ],
  },
  {
    id: 'changes',
    title: '12. Changes to this policy',
    blocks: [
      { text: 'We may update this policy to reflect changes in the Service or in legal requirements. The effective date at the top of this page always shows the current version, and we will notify you in the app before a material change takes effect where the law requires it. Continuing to use the Service after an update means you accept the revised policy.' },
    ],
  },
  {
    id: 'contact',
    title: '13. Contact us',
    blocks: [
      { text: `For any question about this policy, about how your information is handled, or to exercise a right described in section 9, contact us at ${CONTACT_EMAIL}. We aim to answer every privacy enquiry within 30 days.` },
    ],
  },
];

function Block({ block }) {
  if (block.list) {
    return (
      <ul className="list-disc pl-5 space-y-1.5 text-sm sm:text-[0.95rem] leading-relaxed text-foreground/75">
        {block.list.map((item) => <li key={item}>{item}</li>)}
      </ul>
    );
  }
  return (
    <p className="text-sm sm:text-[0.95rem] leading-relaxed text-foreground/75">
      {block.lead ? <span className="font-semibold text-foreground">{block.lead} </span> : null}
      {block.text}
    </p>
  );
}

export default function PrivacyPolicy() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Privacy Policy — TOGETTHERE';
    return () => { document.title = previous; };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-foreground/10">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 min-w-0" aria-label="TOGETTHERE home">
            <BrandLogo className="w-8 h-8" />
            <span className="font-display text-sm font-bold tracking-tight truncate">TOGETTHERE</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/60 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/40 rounded-full px-2 py-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to app
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
        <p className="tt-label text-terra-deep mb-2">Legal</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-3">Privacy Policy</h1>
        <p className="text-sm text-foreground/60 mb-6">
          Effective date: <span className="font-semibold text-foreground/80">{EFFECTIVE_DATE}</span>
          <span className="mx-2">·</span>
          Last updated: <span className="font-semibold text-foreground/80">{LAST_UPDATED}</span>
        </p>

        <p className="text-sm sm:text-[0.95rem] leading-relaxed text-foreground/75 mb-8">
          TOGETTHERE is a group travel planning service. This policy explains what information we access, why we access
          it, how long we keep it, who we share it with, how we protect it, and how you can control or delete it —
          including the Google account data you choose to connect.
        </p>

        <nav aria-label="Contents" className="tt-card p-4 sm:p-5 mb-10">
          <p className="tt-label text-foreground/45 mb-3">Contents</p>
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-foreground/70 hover:text-terra-deep hover:underline">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-9">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-20">
              <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight mb-3">{section.title}</h2>
              <div className="space-y-3">
                {section.blocks.map((block, index) => <Block key={index} block={block} />)}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 pt-6 border-t border-foreground/10 text-xs text-foreground/50 space-y-1">
          <p>TOGETTHERE — Group travel and gatherings. Privacy enquiries: {CONTACT_EMAIL}</p>
          <p>
            Google API Services User Data Policy:{' '}
            <a
              href={GOOGLE_USER_DATA_POLICY}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              developers.google.com/terms/api-services-user-data-policy
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}