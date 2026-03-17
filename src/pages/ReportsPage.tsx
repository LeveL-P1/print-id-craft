import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { mockSchools } from "@/lib/mock-data";
import { BarChart3, School, Printer, FileCheck } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const submissionData = [
  { day: "Mon", count: 45 }, { day: "Tue", count: 62 }, { day: "Wed", count: 38 },
  { day: "Thu", count: 80 }, { day: "Fri", count: 55 }, { day: "Sat", count: 20 },
];

const COLORS = ["hsl(217, 91%, 60%)", "hsl(142, 71%, 45%)", "hsl(38, 92%, 50%)", "hsl(0, 84%, 60%)"];

export default function ReportsPage() {
  const totalCards = mockSchools.reduce((acc, s) => acc + s.submittedCount, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Reports & Analytics</h1>
        <p className="text-sm text-muted-foreground">Overview of ID card operations across all schools</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Total IDs Generated" value={totalCards} icon={FileCheck} />
        <StatCard title="Active Schools" value={mockSchools.filter((s) => s.status === "active").length} icon={School} />
        <StatCard title="Print Jobs Completed" value={12} icon={Printer} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bar Chart */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-muted-foreground" /> Submissions This Week</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={submissionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 32%, 91%)" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Donut Chart */}
        <Card>
          <CardHeader><CardTitle className="text-base">School-wise Distribution</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={mockSchools.filter((s) => s.submittedCount > 0)} dataKey="submittedCount" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3}>
                  {mockSchools.filter((s) => s.submittedCount > 0).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
          <div className="px-6 pb-4 flex flex-wrap gap-3">
            {mockSchools.filter((s) => s.submittedCount > 0).map((s, i) => (
              <div key={s.id} className="flex items-center gap-1.5 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-muted-foreground">{s.name.split(",")[0]}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
