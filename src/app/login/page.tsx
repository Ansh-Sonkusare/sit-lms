import { COLLEGES } from "@/lib/colleges.ts";
import LoginForm from "@/components/LoginForm.tsx";

export default function LoginPage() {
  return <LoginForm colleges={COLLEGES.map(({ id, name }) => ({ id, name }))} />;
}
