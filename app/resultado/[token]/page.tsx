import { DocumentPortal } from "@/components/document-portal";
export const metadata = { referrer: "no-referrer" };
export default function Resultado({ params }: { params: { token: string } }) {
  return <DocumentPortal token={params.token} />;
}
