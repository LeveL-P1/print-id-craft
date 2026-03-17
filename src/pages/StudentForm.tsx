import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Upload, Camera, ChevronRight, ChevronLeft, Image, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = ["Personal Details", "Photo Upload", "Review & Submit"];

export default function StudentForm() {
  const { schoolId, classId } = useParams();
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "", rollNo: "", class: "", dob: "", bloodGroup: "", address: "",
  });

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-6 animate-fade-in max-w-sm">
          <div className="mx-auto h-20 w-20 rounded-full bg-success/10 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-success" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Submission Received!</h1>
            <p className="text-muted-foreground mt-2">Your ID card is in queue. You'll be notified when it's ready.</p>
          </div>
          <div className="inline-flex items-center gap-2 bg-muted rounded-xl px-6 py-3">
            <QrCode className="h-5 w-5 text-muted-foreground" />
            <span className="font-mono font-medium tabular-nums">TOKEN-{schoolId?.toUpperCase()}-{classId?.toUpperCase()}-001</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* School Header */}
      <div className="bg-accent px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent-foreground/20 flex items-center justify-center text-sm font-bold text-accent-foreground">DPS</div>
          <div>
            <h1 className="font-bold text-accent-foreground">Delhi Public School</h1>
            <p className="text-xs text-accent-foreground/70">Student ID Card Submission Form</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-6">
        {/* Progress */}
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex-1 flex items-center gap-2">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors shrink-0",
                i <= step ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
              )}>{i + 1}</div>
              {i < steps.length - 1 && <div className={cn("flex-1 h-0.5 rounded", i < step ? "bg-accent" : "bg-muted")} />}
            </div>
          ))}
        </div>
        <p className="text-sm font-medium text-center">{steps[step]}</p>

        {/* Step 1 */}
        {step === 0 && (
          <Card className="animate-fade-in">
            <CardContent className="p-6 space-y-4">
              <div><Label>Full Name *</Label><Input className="mt-1" placeholder="Enter student's full name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Roll Number *</Label><Input className="mt-1" placeholder="e.g. 001" value={formData.rollNo} onChange={(e) => setFormData({ ...formData, rollNo: e.target.value })} /></div>
                <div>
                  <Label>Class *</Label>
                  <Select value={formData.class} onValueChange={(v) => setFormData({ ...formData, class: v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6-A">Class 6-A</SelectItem>
                      <SelectItem value="6-B">Class 6-B</SelectItem>
                      <SelectItem value="7-A">Class 7-A</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Date of Birth *</Label><Input type="date" className="mt-1" value={formData.dob} onChange={(e) => setFormData({ ...formData, dob: e.target.value })} /></div>
                <div>
                  <Label>Blood Group</Label>
                  <Select value={formData.bloodGroup} onValueChange={(v) => setFormData({ ...formData, bloodGroup: v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((bg) => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Address</Label><Input className="mt-1" placeholder="Enter address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} /></div>
            </CardContent>
          </Card>
        )}

        {/* Step 2 */}
        {step === 1 && (
          <Card className="animate-fade-in">
            <CardContent className="p-6 space-y-4">
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center space-y-4">
                <div className="mx-auto h-24 w-24 rounded-full border-2 border-accent/30 bg-muted flex items-center justify-center">
                  <Image className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">Upload Student Photo</p>
                  <p className="text-xs text-muted-foreground mt-1">Passport size, clear face visible, white background preferred</p>
                </div>
                <div className="flex gap-3 justify-center">
                  <Button variant="outline" className="gap-2"><Upload className="h-4 w-4" /> Upload File</Button>
                  <Button variant="outline" className="gap-2"><Camera className="h-4 w-4" /> Take Photo</Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Photo Guidelines:</Label>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                  <li>Recent passport-size photograph</li>
                  <li>Clear face with both eyes visible</li>
                  <li>White or light background</li>
                  <li>Minimum 300x400 pixels</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3 */}
        {step === 2 && (
          <div className="space-y-4 animate-fade-in">
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-3">Review Your Details</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{formData.name || "—"}</span></div>
                  <div><span className="text-muted-foreground">Roll No:</span> <span className="font-medium">{formData.rollNo || "—"}</span></div>
                  <div><span className="text-muted-foreground">Class:</span> <span className="font-medium">{formData.class || "—"}</span></div>
                  <div><span className="text-muted-foreground">DOB:</span> <span className="font-medium">{formData.dob || "—"}</span></div>
                  <div><span className="text-muted-foreground">Blood Group:</span> <span className="font-medium">{formData.bloodGroup || "—"}</span></div>
                </div>
              </CardContent>
            </Card>

            {/* Live preview */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-3">ID Card Preview</h3>
                <div className="flex gap-4 justify-center">
                  <div className="bg-card rounded-xl shadow-lg border p-3" style={{ width: "200px", height: "125px" }}>
                    <div className="h-full flex flex-col justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="h-6 w-6 rounded bg-accent/20 flex items-center justify-center text-[6px] font-bold text-accent">DPS</div>
                        <div className="text-[7px] font-bold">Delhi Public School</div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <div className="h-10 w-8 rounded bg-muted" />
                        <div className="text-[6px] space-y-0.5">
                          <p className="font-medium">{formData.name || "[Name]"}</p>
                          <p className="text-muted-foreground">Class {formData.class || "[Class]"} · Roll {formData.rollNo || "[Roll]"}</p>
                        </div>
                      </div>
                      <div className="text-[5px] text-muted-foreground text-right">SN: DPS-001</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="gap-2">
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {step < 2 ? (
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2" onClick={() => setStep(step + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button className="bg-success text-success-foreground hover:bg-success/90 gap-2" onClick={() => setSubmitted(true)}>
              <CheckCircle2 className="h-4 w-4" /> Submit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
