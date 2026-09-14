/** MedLum clinic SaaS plans — auto-renewing subscription model (UI + future gateway). */

export type BillingInterval = "monthly" | "yearly";

export type SubscriptionPlanId = "pilot" | "professional" | "clinic_plus";

export type SubscriptionPlan = {
  id: SubscriptionPlanId;
  name: string;
  tagline: string;
  monthlyInr: number;
  yearlyInr: number;
  /** Shown as “save X%” on yearly. */
  yearlySavePct: number;
  popular?: boolean;
  features: string[];
  limits: string[];
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "pilot",
    name: "Pilot",
    tagline: "Single doctor / small OPD starting out",
    monthlyInr: 0,
    yearlyInr: 0,
    yearlySavePct: 0,
    features: [
      "OPD + Patients + basic IPD workspace",
      "Video consults (Jitsi)",
      "Up to 200 patients",
      "Email support",
    ],
    limits: ["1 doctor login", "Community / pilot support", "No multi-clinic"],
  },
  {
    id: "professional",
    name: "Professional",
    tagline: "Busy clinic — auto-renews every month",
    monthlyInr: 1999,
    yearlyInr: 19990,
    yearlySavePct: 17,
    popular: true,
    features: [
      "Everything in Pilot",
      "Full IPD + summaries + labs + Rx",
      "Unlimited patients (fair use)",
      "Telemedicine + invite links",
      "Priority chat support",
      "Auto-renew monthly or yearly",
    ],
    limits: ["Up to 3 doctor logins", "1 clinic", "Cancel anytime"],
  },
  {
    id: "clinic_plus",
    name: "Clinic Plus",
    tagline: "Multi-consultant clinics & chains",
    monthlyInr: 4999,
    yearlyInr: 49990,
    yearlySavePct: 17,
    features: [
      "Everything in Professional",
      "Multi-clinic / multi-consultant",
      "Pharmacy, blood bank, insurance modules",
      "Role-based access",
      "Dedicated onboarding call",
      "SLA support",
    ],
    limits: ["Up to 15 doctor logins", "Multiple clinics", "Custom invoice on request"],
  },
];

export function formatInr(amount: number) {
  if (amount <= 0) return "Free";
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function priceFor(plan: SubscriptionPlan, interval: BillingInterval) {
  return interval === "yearly" ? plan.yearlyInr : plan.monthlyInr;
}
