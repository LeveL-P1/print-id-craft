import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Type, Image, QrCode, Barcode, Square, Minus, Undo2, Redo2, Grid3X3,
  ZoomIn, ZoomOut, RotateCcw, Eye, Save, Upload, GripVertical, Layers,
} from "lucide-react";

const toolboxItems = [
  { label: "Text", icon: Type },
  { label: "Photo", icon: Image },
  { label: "Logo", icon: Square },
  { label: "QR Code", icon: QrCode },
  { label: "Barcode", icon: Barcode },
  { label: "Shape", icon: Square },
  { label: "Line", icon: Minus },
];

const fieldChips = ["[Name]", "[Class]", "[Roll No]", "[Photo]", "[DOB]", "[Blood Group]", "[School Logo]", "[Serial No]"];

const sampleLayers = [
  { id: 1, name: "School Logo", type: "image" },
  { id: 2, name: "Student Photo", type: "field" },
  { id: 3, name: "Student Name", type: "field" },
  { id: 4, name: "Class & Section", type: "field" },
  { id: 5, name: "Roll Number", type: "field" },
  { id: 6, name: "QR Code", type: "element" },
  { id: 7, name: "Background", type: "shape" },
];

export default function TemplateDesigner() {
  const [face, setFace] = useState<"front" | "back">("front");
  const [showPreview, setShowPreview] = useState(false);
  const [zoom, setZoom] = useState(100);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Template Designer</h1>
        <div className="flex items-center gap-2">
          <Select defaultValue="cr80">
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cr80">CR80 (Standard)</SelectItem>
              <SelectItem value="custom">Custom Size</SelectItem>
            </SelectContent>
          </Select>
          <Input type="number" defaultValue="300" className="w-20" placeholder="DPI" />
        </div>
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="flex items-center justify-between p-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon"><Undo2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon"><Redo2 className="h-4 w-4" /></Button>
            <div className="w-px h-6 bg-border mx-2" />
            <Button variant="ghost" size="icon" onClick={() => setZoom(Math.max(50, zoom - 10))}><ZoomOut className="h-4 w-4" /></Button>
            <span className="text-xs font-medium tabular-nums w-10 text-center">{zoom}%</span>
            <Button variant="ghost" size="icon" onClick={() => setZoom(Math.min(200, zoom + 10))}><ZoomIn className="h-4 w-4" /></Button>
            <div className="w-px h-6 bg-border mx-2" />
            <Button variant="ghost" size="icon"><Grid3X3 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon"><RotateCcw className="h-4 w-4" /></Button>
          </div>
          <Tabs value={face} onValueChange={(v) => setFace(v as "front" | "back")}>
            <TabsList><TabsTrigger value="front">Front</TabsTrigger><TabsTrigger value="back">Back</TabsTrigger></TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {/* Three-panel layout */}
      <div className="grid grid-cols-12 gap-4" style={{ minHeight: "500px" }}>
        {/* Left: Toolbox */}
        <div className="col-span-3 lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Elements</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 pb-4">
              {toolboxItems.map((item) => (
                <button key={item.label} className="flex flex-col items-center gap-1.5 p-3 rounded-lg border bg-card hover:bg-accent/5 hover:border-accent/30 transition-all text-xs font-medium cursor-grab">
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                  {item.label}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Dynamic Fields</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-1.5 pb-4">
              {fieldChips.map((chip) => (
                <span key={chip} className="inline-flex items-center rounded-md bg-accent/10 border border-accent/20 px-2 py-1 text-xs font-medium text-accent cursor-grab hover:bg-accent/20 transition-colors">
                  {chip}
                </span>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Center: Canvas */}
        <div className="col-span-6 lg:col-span-8 flex items-center justify-center bg-muted/30 rounded-xl border-2 border-dashed border-border">
          <div
            className="bg-card rounded-xl shadow-xl border relative overflow-hidden"
            style={{ width: `${3.375 * zoom * 0.96}px`, height: `${2.125 * zoom * 0.96}px`, transform: `scale(${zoom / 100})`, transformOrigin: "center" }}
          >
            {face === "front" ? (
              <div className="p-4 h-full flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">LOGO</div>
                    <div>
                      <div className="text-[10px] font-bold text-foreground">School Name</div>
                      <div className="text-[8px] text-muted-foreground">Affiliation: CBSE</div>
                    </div>
                  </div>
                  <div className="text-[8px] font-medium text-accent">IDENTITY CARD</div>
                </div>
                <div className="flex gap-3 items-center">
                  <div className="h-16 w-14 rounded-lg bg-muted flex items-center justify-center">
                    <Image className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                  <div className="space-y-1 text-[9px]">
                    <p><span className="text-muted-foreground">Name:</span> <span className="font-medium">[Name]</span></p>
                    <p><span className="text-muted-foreground">Class:</span> <span className="font-medium">[Class]</span></p>
                    <p><span className="text-muted-foreground">Roll No:</span> <span className="font-medium">[Roll No]</span></p>
                    <p><span className="text-muted-foreground">DOB:</span> <span className="font-medium">[DOB]</span></p>
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                    <QrCode className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                  <div className="text-[7px] text-muted-foreground">Serial: [Serial No]</div>
                </div>
              </div>
            ) : (
              <div className="p-4 h-full flex flex-col justify-between">
                <div className="text-center space-y-1">
                  <div className="text-[10px] font-bold text-foreground">GENERAL INSTRUCTIONS</div>
                  <div className="text-[7px] text-muted-foreground space-y-0.5">
                    <p>1. This card is the property of the school.</p>
                    <p>2. If found, please return to the school office.</p>
                    <p>3. This card is non-transferable.</p>
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <div className="text-[9px]"><span className="text-muted-foreground">Blood Group:</span> <span className="font-medium">[Blood Group]</span></div>
                  <div className="text-[9px]"><span className="text-muted-foreground">Address:</span> <span className="font-medium">Student Address Here</span></div>
                </div>
                <div className="flex items-end justify-between">
                  <div className="text-[7px] text-muted-foreground">Valid: 2024-25</div>
                  <div className="text-center">
                    <div className="w-16 border-t border-foreground/30 mt-4" />
                    <div className="text-[7px] text-muted-foreground">Principal's Sign</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Layers */}
        <div className="col-span-3 lg:col-span-2">
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4" /> Layers</CardTitle></CardHeader>
            <CardContent className="space-y-1 pb-4">
              {sampleLayers.map((layer) => (
                <div key={layer.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-xs group">
                  <GripVertical className="h-3 w-3 text-muted-foreground/50 group-hover:text-muted-foreground" />
                  <span className="flex-1">{layer.name}</span>
                  <span className="text-[10px] text-muted-foreground">{layer.type}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button variant="outline" className="gap-2"><Save className="h-4 w-4" /> Save Draft</Button>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setShowPreview(true)}>
            <Eye className="h-4 w-4" /> Preview with Sample Data
          </Button>
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
            <Upload className="h-4 w-4" /> Publish Template
          </Button>
        </div>
      </div>

      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Template Preview — Sample Data</DialogTitle></DialogHeader>
          <div className="flex gap-6 justify-center py-4">
            {["Front", "Back"].map((side) => (
              <div key={side} className="space-y-2 text-center">
                <p className="text-sm font-medium text-muted-foreground">{side}</p>
                <div className="bg-card rounded-xl shadow-lg border p-4" style={{ width: "280px", height: "170px" }}>
                  {side === "Front" ? (
                    <div className="h-full flex flex-col justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded bg-accent/20 flex items-center justify-center text-[8px] font-bold text-accent">DPS</div>
                        <div><div className="text-[9px] font-bold">Delhi Public School</div><div className="text-[7px] text-muted-foreground">CBSE</div></div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <div className="h-12 w-10 rounded bg-muted flex items-center justify-center"><Image className="h-4 w-4 text-muted-foreground/40" /></div>
                        <div className="text-[8px] space-y-0.5">
                          <p className="font-medium">Aarav Patel</p>
                          <p className="text-muted-foreground">Class 6-A · Roll 001</p>
                          <p className="text-muted-foreground">DOB: 14 May 2012</p>
                        </div>
                      </div>
                      <div className="text-[7px] text-muted-foreground text-right">DPS-6A-001</div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col justify-between text-center">
                      <div className="text-[8px] font-bold">GENERAL INSTRUCTIONS</div>
                      <div className="text-[7px] text-muted-foreground">Blood Group: B+ · Address: Vasant Kunj, Delhi</div>
                      <div className="text-[7px] text-muted-foreground">Valid: 2024-25</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
