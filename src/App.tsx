import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import LoginPage from "./pages/Login";
import DashboardLayout from "./components/DashboardLayout";
import DashboardHome from "./pages/DashboardHome";
import SchoolManagement from "./pages/SchoolManagement";
import SchoolDetail from "./pages/SchoolDetail";
import TemplateDesigner from "./pages/TemplateDesigner";
import PrintBatchManager from "./pages/PrintBatchManager";
import ReportsPage from "./pages/ReportsPage";
import MatcherPage from "./pages/MatcherPage";
import StudentForm from "./pages/StudentForm";
import TeacherDashboard from "./pages/TeacherDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardHome />} />
            <Route path="/schools" element={<SchoolManagement />} />
            <Route path="/schools/:id" element={<SchoolDetail />} />
            <Route path="/templates" element={<TemplateDesigner />} />
            <Route path="/batches" element={<PrintBatchManager />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/matcher" element={<MatcherPage />} />
          </Route>
          <Route path="/submit/:schoolId/:classId" element={<StudentForm />} />
          <Route path="/teacher" element={<TeacherDashboard />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
