import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Index() {
  const store = await cookies();
  redirect(store.get("miy_session") ? "/home" : "/welcome");
}
