import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { mockStudents } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Mail, MessageCircle, Search, Eye, Flag, CheckCircle2, Image } from "lucide-react";
import { toast } from "sonner";

export default function TeacherDashboard() {
  const [search, setSearch] = useState("");
  const [flagModal, setFlagModal] = useState<string | null>(null);
  const [previewModal, setPreviewModal] = useState<string | null>(null);
  const [flagNote, setFlagNote] = useState("");

  const students = mockStudents.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
  const submitted = mockStudents.filter((s) => s.status !== "pending").length;
  const pending = mockStudents.filter((s) => s.status === "pending").length;
  const flagged = mockStudents.filter((s) => s.status === "flagged").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-accent px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="font-bold text-accent-foreground text-lg">Delhi Public School — Class 6-A</h1>
          <p className="text-sm text-accent-foreground/70">Teacher: Mrs. Sharma</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Share Link */}
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-sm">Student Submission Link</p>
              <p className="text-xs text-muted-foreground mt-0.5">{window.location.origin}/submit/s1/c1</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { navigator.clipboard.writeText(window.location.origin + "/submit/s1/c1"); toast.success("Link copied!"); }}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</Button>
              <Button variant="outline" size="sm" className="gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-4">
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{mockStudents.length}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-info">{submitted}</p><p className="text-xs text-muted-foreground">Submitted</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-warning">{pending}</p><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-destructive">{flagged}</p><p className="text-xs text-muted-foreground">Flagged</p></CardContent></Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Student Submissions</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Roll No</TableHead>
                  <TableHead>Submitted At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="tabular-nums">{s.rollNo}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{s.submittedAt || "—"}</TableCell>
                    <TableCell><StatusBadge status={s.status} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setPreviewModal(s.id)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { setFlagModal(s.id); setFlagNote(""); }}><Flag className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => toast.success(`${s.name} approved`)}><CheckCircle2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Preview Modal */}
      <Dialog open={!!previewModal} onOpenChange={() => setPreviewModal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>ID Card Preview</DialogTitle></DialogHeader>
          <div className="flex gap-6 justify-center py-4">
            {["Front", "Back"].map((side) => (
              <div key={side} className="text-center space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{side}</p>
                <div className="bg-card rounded-xl shadow-lg border p-4" style={{ width: "250px", height: "155px" }}>
                  <div className="h-full flex flex-col items-center justify-center">
                    <Image className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground mt-2">{side} Preview</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Flag Modal */}
      <Dialog open={!!flagModal} onOpenChange={() => setFlagModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Flag Submission</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Correction Note</label>
              <Textarea className="mt-1" placeholder="Describe the issue..." value={flagNote} onChange={(e) => setFlagNote(e.target.value)} />
            </div>
            <Button className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { toast.success("Student flagged"); setFlagModal(null); }}>
              Submit Flag
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
