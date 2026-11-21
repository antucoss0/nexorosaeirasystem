import { DocumentPortal } from "@/components/document-portal";
export const metadata = { referrer: "no-referrer" };
export default async function Resultado({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <DocumentPortal token={(await params).token} />;
}
