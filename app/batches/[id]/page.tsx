import { notFound } from "next/navigation";
import { BatchDashboard } from "@/components/BatchDashboard";
import { getAuthorizedBatch } from "@/lib/access";

type BatchPageProps = {
  params: {
    id: string;
  };
};

export default async function BatchPage({ params }: BatchPageProps) {
  const { batch: initialBatch, authorized } = await getAuthorizedBatch(params.id);

  if (!initialBatch || !authorized) {
    notFound();
  }

  return <BatchDashboard batchId={params.id} initialBatch={initialBatch} />;
}
