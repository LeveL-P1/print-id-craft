import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, Image } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScanResult {
  serial: string;
  name: string;
  school: string;
  className: string;
  matched: boolean;
  scannedAt: string;
}

const mockScans: ScanResult[] = [
  { serial: "DPS-6A-001", name: "Aarav Patel", school: "Delhi Public School", className: "6-A", matched: true, scannedAt: "14:32:05" },
  { serial: "DPS-6A-002", name: "Priya Sharma", school: "Delhi Public School", className: "6-A", matched: true, scannedAt: "14:32:18" },
  { serial: "DPS-6A-003", name: "Rohan Gupta", school: "Delhi Public School", className: "6-A", matched: false, scannedAt: "14:32:30" },
];

export default function MatcherPage() {
  const [serial, setSerial] = useState("");
  const [scans, setScans] = useState<ScanResult[]>(mockScans);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [flash, setFlash] = useState<"matched" | "mismatched" | null>(null);

  const handleScan = () => {
    if (!serial.trim()) return;
    const matched = Math.random() > 0.3;
    const result: ScanResult = {
      serial: serial.toUpperCase(),
      name: "Student Name",
      school: "Delhi Public School",
      className: "6-A",
      matched,
      scannedAt: new Date().toLocaleTimeString(),
    };
    setLastScan(result);
    setScans([result, ...scans]);
    setFlash(matched ? "matched" : "mismatched");
    setTimeout(() => setFlash(null), 1000);
    setSerial("");
  };

  const mismatches = scans.filter((s) => !s.matched).length;

  return (
    <div className={cn(
      "min-h-screen bg-foreground text-primary-foreground transition-all duration-300",
      flash === "matched" && "ring-4 ring-inset ring-success",
      flash === "mismatched" && "ring-4 ring-inset ring-destructive",
    )}>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Front-Back Matcher</h1>
            <p className="text-sm text-primary-foreground/60">Print floor verification station</p>
          </div>
          <Button variant="outline" className="gap-2 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10" onClick={() => {}}>
            <Download className="h-4 w-4" /> Export Mismatches ({mismatches})
          </Button>
        </div>

        {/* Scan Bar */}
        <div className="relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-6 w-6 text-primary-foreground/40" />
          <Input
            className="h-20 text-3xl font-mono bg-primary-foreground/5 border-primary-foreground/10 text-primary-foreground pl-16 placeholder:text-primary-foreground/20"
            placeholder="Scan or enter Serial Number..."
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleScan()}
            autoFocus
          />
        </div>

        {/* Scan Result */}
        {lastScan && (
          <Card className="bg-primary-foreground/5 border-primary-foreground/10 animate-fade-in">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xl font-bold text-primary-foreground">{lastScan.name}</p>
                  <p className="text-sm text-primary-foreground/60">{lastScan.school} · {lastScan.className} · {lastScan.serial}</p>
                </div>
                <StatusBadge status={lastScan.matched ? "matched" : "mismatched"} />
              </div>
              <div className="flex gap-6 justify-center">
                {["Front", "Back"].map((side) => (
                  <div key={side} className="text-center space-y-2">
                    <p className="text-xs font-medium text-primary-foreground/50">{side}</p>
                    <div className="bg-primary-foreground/5 rounded-xl border border-primary-foreground/10 p-4" style={{ width: "180px", height: "110px" }}>
                      <div className="h-full flex items-center justify-center">
                        <Image className="h-6 w-6 text-primary-foreground/20" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scan History */}
        <Card className="bg-primary-foreground/5 border-primary-foreground/10">
          <CardHeader><CardTitle className="text-base text-primary-foreground">Scan History</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-primary-foreground/10">
                  <TableHead className="text-primary-foreground/60">Serial</TableHead>
                  <TableHead className="text-primary-foreground/60">Name</TableHead>
                  <TableHead className="text-primary-foreground/60">School</TableHead>
                  <TableHead className="text-primary-foreground/60">Status</TableHead>
                  <TableHead className="text-primary-foreground/60">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scans.map((s, i) => (
                  <TableRow key={i} className="border-primary-foreground/10">
                    <TableCell className="font-mono text-primary-foreground">{s.serial}</TableCell>
                    <TableCell className="text-primary-foreground">{s.name}</TableCell>
                    <TableCell className="text-primary-foreground/60">{s.school}</TableCell>
                    <TableCell><StatusBadge status={s.matched ? "matched" : "mismatched"} /></TableCell>
                    <TableCell className="font-mono text-primary-foreground/60">{s.scannedAt}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
