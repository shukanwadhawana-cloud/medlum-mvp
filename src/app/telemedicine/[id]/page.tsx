"use client";

import TelemedicineConsultationPage from "@/components/TelemedicineConsultationPage";

export default function Page(props: { params: Promise<{ id: string }> }) {
  return <TelemedicineConsultationPage {...props} />;
}
