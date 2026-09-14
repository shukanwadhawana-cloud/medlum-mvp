export type BillingInterval = "monthly" | "yearly";

export type SubscriptionPlan = {
  id: "pilot" | "professional" | "clinic_plus";
  name: string;
  tagline: string;
  popular?: boolean;
  monthly: number;
  yearly: number;
  features: string[];
  limits: string[];
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "pilot",
    name: "Pilot",
    tagline: "Start with MedLum at no cost.",
    monthly: 0,
    yearly: 0,
    features: ["Core clinical workflow", "OPD and IPD", "Pilot support"],
    limits: ["No payment method required", "Pilot access"],
  },
  {
    id: "professional",
    name: "Professional",
    tagline: "For individual doctors and growing practices.",
    monthly: 1999,
    yearly: 19990,
    popular: true,
    features: ["Full clinical workflow", "Billing and subscriptions", "Razorpay recurring payments"],
    limits: ["Up to 5,000 patients", "Monthly or yearly billing"],
  },
  {
    id: "clinic_plus",
    name: "Clinic Plus",
    tagline: "For larger clinics and multi-user teams.",
    monthly: 4999,
    yearly: 49990,
    features: ["Everything in Professional", "Larger patient capacity", "Multi-user clinic workflows"],
    limits: ["Up to 10,000 patients", "Monthly or yearly billing"],
  },
];

export function priceFor(plan: SubscriptionPlan, interval: BillingInterval): number {
  return interval === "yearly" ? plan.yearly : plan.monthly;
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
