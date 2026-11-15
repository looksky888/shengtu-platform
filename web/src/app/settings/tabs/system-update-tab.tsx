import { SystemUpdateCard } from "../components/system-update-card";

export default function SystemUpdateTab() {
  return (
    <section className="flex flex-col gap-5">
      <div id="settings-section-system-update">
        <SystemUpdateCard />
      </div>
    </section>
  );
}
