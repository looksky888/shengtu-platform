import { CPAPoolDialog } from "../components/cpa-pool-dialog";
import { CPAPoolsCard } from "../components/cpa-pools-card";
import { ImportBrowserDialog } from "../components/import-browser-dialog";

export default function CPATab() {
  return (
    <>
      <section className="flex flex-col gap-5">
        <CPAPoolsCard />
      </section>
      <CPAPoolDialog />
      <ImportBrowserDialog />
    </>
  );
}
