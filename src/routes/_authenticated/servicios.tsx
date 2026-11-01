import { createFileRoute } from "@tanstack/react-router";
import { ServiceLedger } from "@/components/service-ledger";
export const Route = createFileRoute("/_authenticated/servicios")({ component: ServicesPage });
function ServicesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-2xl font-bold">Servicios contratistas</h1>
      <div className="card p-4">
        <ServiceLedger />
      </div>
    </div>
  );
}
