import type { Metadata } from "next";
import AdminDashboard from "@/components/AdminDashboard";

export const metadata: Metadata = {
  title: "Admin · Sweepstakes News",
  description: "Manage World Cup 2026 sweepstakes entries.",
};

export default function AdminPage() {
  return <AdminDashboard />;
}
