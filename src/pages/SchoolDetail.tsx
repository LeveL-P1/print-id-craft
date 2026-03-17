import { useParams, Link } from "react-router-dom";
import { mockSchools, mockStudents } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";

export default function SchoolDetail() {
  const { id } = useParams();
  const school = mockSchools.find((s) => s.id === id);

  if (!school) return <div className="p-8 text-center text-muted-foreground">School not found</div>;

  const pct = school.totalStudents > 0 ? Math.round((school.submittedCount / school.totalStudents) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link to="/schools"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-sm font-bold" style={{ backgroundColor: school.primaryColor + "15", color: school.primaryColor }}>
            {school.logo}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{school.name}</h1>
            <p className="text-sm text-muted-foreground">{school.board} · {school.address}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="p-6 text-center"><p className="text-3xl font-bold">{school.activeClasses}</p><p className="text-sm text-muted-foreground">Active Classes</p></CardContent></Card>
            <Card><CardContent className="p-6 text-center"><p className="text-3xl font-bold">{school.totalStudents}</p><p className="text-sm text-muted-foreground">Total Students</p></CardContent></Card>
            <Card><CardContent className="p-6 text-center"><p className="text-3xl font-bold">{pct}%</p><p className="text-sm text-muted-foreground">Submission Rate</p></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="classes" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Classes</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {school.classes.map((cls) => (
                    <TableRow key={cls.id}>
                      <TableCell className="font-medium">{cls.name}</TableCell>
                      <TableCell>{cls.section}</TableCell>
                      <TableCell>{cls.teacherName}</TableCell>
                      <TableCell className="tabular-nums">{cls.submittedCount}/{cls.totalStudents}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(window.location.origin + cls.submissionLink); toast.success("Link copied!"); }}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon"><Share2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submissions" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Recent Submissions</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Roll No</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockStudents.slice(0, 5).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="tabular-nums">{s.rollNo}</TableCell>
                      <TableCell>{s.className} {s.section}</TableCell>
                      <TableCell><StatusBadge status={s.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
