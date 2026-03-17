import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { mockSchools } from "@/lib/mock-data";
import { Plus, Search } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function SchoolManagement() {
  const [search, setSearch] = useState("");
  const filtered = mockSchools.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schools</h1>
          <p className="text-sm text-muted-foreground">Manage onboarded schools</p>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
              <Plus className="h-4 w-4" /> Add School
            </Button>
          </SheetTrigger>
          <SheetContent className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Add New School</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-6">
              <div><Label>School Name</Label><Input placeholder="Enter school name" className="mt-1" /></div>
              <div><Label>Address</Label><Input placeholder="Full address" className="mt-1" /></div>
              <div><Label>Board / Affiliation</Label><Input placeholder="CBSE, ICSE, State Board" className="mt-1" /></div>
              <div><Label>Primary Color</Label><Input type="color" defaultValue="#3B82F6" className="mt-1 h-10 w-20" /></div>
              <div><Label>Logo Upload</Label><Input type="file" accept="image/*" className="mt-1" /></div>
              <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => toast.success("School added successfully!")}>
                Save School
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search schools..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((school) => {
          const pct = school.totalStudents > 0 ? Math.round((school.submittedCount / school.totalStudents) * 100) : 0;
          return (
            <Link key={school.id} to={`/schools/${school.id}`}>
              <Card className="transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer h-full">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-12 w-12 rounded-xl flex items-center justify-center text-sm font-bold"
                        style={{ backgroundColor: school.primaryColor + "15", color: school.primaryColor }}
                      >
                        {school.logo}
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{school.name}</h3>
                        <p className="text-xs text-muted-foreground">{school.board}</p>
                      </div>
                    </div>
                    <StatusBadge status={school.status} />
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{school.activeClasses} classes</span>
                    <span className="font-medium tabular-nums">{pct}% submitted</span>
                  </div>

                  {/* Progress ring (simplified as bar) */}
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
