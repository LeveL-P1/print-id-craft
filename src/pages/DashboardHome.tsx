import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockSchools, mockActivities } from "@/lib/mock-data";
import { School, FileText, AlertCircle, Printer, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/StatusBadge";

export default function DashboardHome() {
  const totalSchools = mockSchools.length;
  const totalSubmissions = mockSchools.reduce((acc, s) => acc + s.submittedCount, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your ID card operations</p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Schools" value={totalSchools} icon={School} trend="+2 this month" />
        <StatCard title="Submissions Today" value={87} icon={FileText} trend="+12% vs yesterday" />
        <StatCard title="Pending Reviews" value={34} icon={AlertCircle} />
        <StatCard title="Print Jobs Queued" value={5} icon={Printer} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Activity Feed */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {mockActivities.map((a) => (
              <div key={a.id} className="flex items-start gap-3 text-sm">
                <div className="mt-1.5 h-2 w-2 rounded-full bg-accent shrink-0" />
                <div className="flex-1">
                  <p className="text-foreground">{a.message}</p>
                  <p className="text-xs text-muted-foreground">{a.timestamp}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* School Progress */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">School-wise Submission Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {mockSchools.map((school) => {
              const pct = school.totalStudents > 0
                ? Math.round((school.submittedCount / school.totalStudents) * 100)
                : 0;
              return (
                <div key={school.id} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold text-accent-foreground" style={{ backgroundColor: school.primaryColor + "20", color: school.primaryColor }}>
                        {school.logo}
                      </div>
                      <span className="font-medium">{school.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground tabular-nums">{school.submittedCount}/{school.totalStudents}</span>
                      <StatusBadge status={school.status} />
                    </div>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
