"use client";
// Terms & conditions — a plain-language draft, honestly labeled as the
// testing-stage version. Final legal text lands before public launch.
import { useT } from "@/shared/i18n";

export default function TermsPage() {
  const t = useT();
  return (
    <div className="space-y-4 pt-2 pb-6">
      <h1 className="text-xl font-bold">{t("terms.title")}</h1>
      <p className="text-sm text-text-secondary" data-testid="terms-version">{t("terms.version")}</p>
      <div className="space-y-3 rounded-card border border-border bg-surface p-4 text-sm leading-relaxed">
        <p><strong>1. What MI YONE is.</strong> MI YONE is a business record-keeping and business-intelligence tool. It helps you record what happens in your business and understand what your own records say. It is not a bank, a wallet, or a payment service, and it does not hold or move money.</p>
        <p><strong>2. Your account.</strong> You are responsible for keeping your password private. Records created under your account are treated as entered by you or people you gave access to.</p>
        <p><strong>3. Your records.</strong> The figures MI YONE shows are calculated from the records you enter. MI YONE keeps records honestly — corrections keep their history — but the accuracy of what you enter is your responsibility. MI YONE's summaries and the Partner's explanations are information, not financial, legal, or tax advice.</p>
        <p><strong>4. Acceptable use.</strong> Do not use MI YONE for unlawful activity, attempt to access other people's business data, or interfere with the service.</p>
        <p><strong>5. Testing stage.</strong> This version is provided for testing. The service may change, be interrupted, or be reset. Please keep independent copies of information you cannot afford to lose (Reports → export).</p>
        <p><strong>6. Liability.</strong> To the extent the law allows, MI YONE is provided "as is" during testing, without warranties, and the team is not liable for business decisions made using it.</p>
        <p><strong>7. Changes.</strong> These terms will be replaced by final terms before public launch; the version and date shown above will change when they do.</p>
      </div>
    </div>
  );
}
