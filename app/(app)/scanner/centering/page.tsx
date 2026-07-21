import { CenteringCheckFlow } from "@/components/centering/CenteringCheckFlow";
import { requireUser } from "@/lib/auth";

export default async function ScannerCenteringPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-5xl">
      <CenteringCheckFlow returnTo="/scanner" />
    </div>
  );
}
