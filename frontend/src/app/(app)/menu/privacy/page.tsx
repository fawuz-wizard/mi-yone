"use client";
// Privacy policy — how business data is actually handled in this build,
// including the AI processing rules. Draft labeled for the testing stage.
import { useT } from "@/shared/i18n";

export default function PrivacyPage() {
  const t = useT();
  return (
    <div className="space-y-4 pt-2 pb-6">
      <h1 className="text-xl font-bold">{t("privacy.title")}</h1>
      <p className="text-sm text-text-secondary" data-testid="privacy-version">{t("privacy.version")}</p>
      <div className="space-y-3 rounded-card border border-border bg-surface p-4 text-sm leading-relaxed">
        <p><strong>What we store.</strong> Your account details (name, email/phone, a securely hashed password) and the business records you enter: sales, expenses, products, stock, customers, suppliers, and debts. Every record keeps when it happened, when it was entered, and how it was entered.</p>
        <p><strong>Who can see it.</strong> Your business data belongs to your business. It is isolated per business account — other businesses can never see it, and it is not sold or shared with advertisers.</p>
        <p><strong>How the AI works with your data.</strong> All figures are computed by MI YONE itself from your records — the AI never invents numbers. The Partner answers using verified summaries of your own data. If an external AI provider is enabled, only your question and those computed summaries are sent to phrase the reply; if none is enabled, everything stays inside MI YONE. Voice input uses your phone's speech service to turn speech into text.</p>
        <p><strong>WhatsApp catalog.</strong> If you connect a catalog, MI YONE reads your product list from Meta only when you press import, and you review every item before it is added.</p>
        <p><strong>Security.</strong> Sign-in uses secure sessions you can see and revoke under Menu → Security. Passwords are stored hashed, never in plain text.</p>
        <p><strong>Your control.</strong> You can correct records (with visible history), export your reports, disconnect integrations, and sign out of other devices at any time.</p>
        <p><strong>Testing stage.</strong> This policy will be finalized before public launch; the version above will change when it is.</p>
      </div>
    </div>
  );
}
