import { Button } from "@/components/glaze/ui/button";
import { Icon, Pending } from "@/components/glaze/icon";
import { hostOf } from "@/lib/neo/schools";

/** Shown while an address from the URL is checked, which usually takes under a second. */
export function CheckingStep({ slug, onCancel }: { slug: string; onCancel: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p role="status" className="neo-vt-school flex items-center gap-2 type-body-sm text-text-2">
        <Icon icon={Pending} className="animate-spin text-neo-text motion-reduce:animate-none" />
        Checking <span className="mono">{hostOf(slug)}</span>
      </p>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Choose another school
      </Button>
    </div>
  );
}
