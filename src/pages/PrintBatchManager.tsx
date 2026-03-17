import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { mockBatches } from "@/lib/mock-data";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Printer, Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export default function PrintBatchManager() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [batchType, setBatchType] = useState<"front" | "back">("front");

  const handleGenerate = (type: "front" | "back") => {
    setBatchType(type);
    setConfirmOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Print Batches</h1>
        <p className="text-sm text-muted-foreground">Generate and manage print-ready card batches</p>
      </div>

      {/* Action Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 border-accent/30 bg-accent/5" onClick={() => handleGenerate("front")}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="rounded-xl bg-accent/10 p-4"><Printer className="h-6 w-6 text-accent" /></div>
            <div>
              <p className="font-semibold">Generate Front Batch PDF</p>
              <p className="text-sm text-muted-foreground">Create print-ready front side cards</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 border-success/30 bg-success/5" onClick={() => handleGenerate("back")}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="rounded-xl bg-success/10 p-4"><Printer className="h-6 w-6 text-success" /></div>
            <div>
              <p className="font-semibold">Generate Back Batch PDF</p>
              <p className="text-sm text-muted-foreground">Create print-ready back side cards</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Batch History */}
      <Card>
        <CardHeader><CardTitle className="text-base">Batch History</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch ID</TableHead>
                <TableHead>School</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Cards</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Generated At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockBatches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-sm">{b.id}</TableCell>
                  <TableCell>{b.schoolName}</TableCell>
                  <TableCell>{b.className}</TableCell>
                  <TableCell className="tabular-nums">{b.cardsCount}</TableCell>
                  <TableCell className="capitalize">{b.type}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.generatedAt}</TableCell>
                  <TableCell><StatusBadge status={b.status} /></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => toast.success("PDF downloaded")}><Download className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => toast.success("Manifest downloaded")}><FileSpreadsheet className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Generate ${batchType === "front" ? "Front" : "Back"} Batch`}
        description={`This will generate a print-ready PDF for 35 approved ${batchType} cards. Cards will be sorted by serial number (ascending). Ensure all approvals are complete before generating.`}
        confirmLabel="Generate Batch"
        onConfirm={() => { toast.success(`${batchType === "front" ? "Front" : "Back"} batch generation started`); setConfirmOpen(false); }}
      />
    </div>
  );
}
