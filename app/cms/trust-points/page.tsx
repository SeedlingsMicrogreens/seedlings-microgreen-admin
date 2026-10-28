import { redirect } from "next/navigation";

// Trust Points are edited in Homepage Content; this legacy editor is kept only as a redirect for old links.
export default function TrustPointsPage() {
  redirect("/cms/homepage?section=trust");
}
