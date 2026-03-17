import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Shield, GraduationCap, Crown, ArrowRight } from "lucide-react";

const roles = [
  { id: "manufacturer", label: "Manufacturer Admin", desc: "Manage schools, templates & print batches", icon: Shield, accent: "bg-accent text-accent-foreground" },
  { id: "teacher", label: "School Teacher", desc: "Track student submissions & approvals", icon: GraduationCap, accent: "bg-success text-success-foreground" },
  { id: "super", label: "Super Admin", desc: "Full system access & analytics", icon: Crown, accent: "bg-warning text-warning-foreground" },
];

export default function LoginPage() {
  const [selectedRole, setSelectedRole] = useState("manufacturer");
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRole === "teacher") {
      navigate("/teacher");
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,hsl(217_91%_60%/0.15),transparent_60%)]" />
        <div className="relative z-10 text-center">
          <div className="mb-8 inline-flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center">
              <span className="text-xl font-bold text-accent-foreground">P</span>
            </div>
            <h1 className="text-3xl font-bold text-primary-foreground">PrintID Pro</h1>
          </div>
          {/* Stacked ID cards illustration */}
          <div className="relative w-80 h-56 mx-auto">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="absolute rounded-xl border border-primary-foreground/10 bg-primary-foreground/5 backdrop-blur-sm shadow-xl"
                style={{
                  width: "280px", height: "170px",
                  top: `${i * 16}px`, left: `${i * 16}px`,
                  transform: `rotate(${(i - 1) * 3}deg)`,
                  zIndex: 3 - i,
                }}
              >
                <div className="p-4 h-full flex flex-col justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-accent/30" />
                    <div className="space-y-1">
                      <div className="h-2.5 w-24 rounded bg-primary-foreground/20" />
                      <div className="h-2 w-16 rounded bg-primary-foreground/10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2 w-full rounded bg-primary-foreground/10" />
                    <div className="h-2 w-3/4 rounded bg-primary-foreground/10" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="h-8 w-8 rounded bg-primary-foreground/10" />
                    <div className="h-2 w-20 rounded bg-primary-foreground/10" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-primary-foreground/60 mt-12 text-sm max-w-xs mx-auto">
            Multi-School ID Card Management & Print Portal for manufacturers
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex flex-1 items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
              <span className="text-lg font-bold text-accent-foreground">P</span>
            </div>
            <h1 className="text-2xl font-bold">PrintID Pro</h1>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
            <p className="text-muted-foreground text-sm mt-1">Select your role and sign in to continue</p>
          </div>

          {/* Role Cards */}
          <div className="grid grid-cols-1 gap-3">
            {roles.map((role) => (
              <Card
                key={role.id}
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md",
                  selectedRole === role.id ? "ring-2 ring-accent shadow-md" : "hover:-translate-y-0.5"
                )}
                onClick={() => setSelectedRole(role.id)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className={cn("rounded-lg p-2.5", role.accent)}>
                    <role.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{role.label}</p>
                    <p className="text-xs text-muted-foreground">{role.desc}</p>
                  </div>
                  <div className={cn("h-4 w-4 rounded-full border-2 transition-colors", selectedRole === role.id ? "border-accent bg-accent" : "border-border")} />
                </CardContent>
              </Card>
            ))}
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input type="email" placeholder="admin@printidpro.com" className="mt-1" defaultValue="admin@printidpro.com" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Password</label>
              <Input type="password" placeholder="••••••••" className="mt-1" defaultValue="password" />
            </div>
            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
              Sign In <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
