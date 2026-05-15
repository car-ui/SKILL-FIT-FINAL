import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "@/pages/landing";
import UserAuth from "@/pages/user-auth";
import UserDashboard from "@/pages/user/dashboard";
import UserInterviewDetail from "@/pages/user/interview-detail";
import Register from "@/pages/register";
import Interview from "@/pages/interview";
import Results from "@/pages/results";
import AdminLogin from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminCandidates from "@/pages/admin/candidates";
import CandidateDetail from "@/pages/admin/candidate-detail";
import { AdminLayout } from "@/components/admin-layout";
import NotFound from "@/pages/not-found";
import { useGetAdminMe, getGetAdminMeQueryKey } from "@workspace/api-client-react";
import { useEffect } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

function AdminGuard({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const { data: me, isLoading } = useGetAdminMe({
    query: { queryKey: getGetAdminMeQueryKey(), retry: false },
  });

  useEffect(() => {
    if (!isLoading && !me) {
      navigate("/admin/login");
    }
  }, [me, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!me) return null;

  return <AdminLayout>{children}</AdminLayout>;
}

function Router() {
  return (
    <Switch>
      {/* Candidate PWA */}
      <Route path="/" component={Landing} />
      <Route path="/user/login" component={UserAuth} />
      <Route path="/user/dashboard" component={UserDashboard} />
      <Route path="/user/interviews/:id" component={UserInterviewDetail} />
      <Route path="/register" component={Register} />
      <Route path="/interview" component={Interview} />
      <Route path="/results" component={Results} />

      {/* Admin */}
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin">
        {() => (
          <AdminGuard>
            <AdminDashboard />
          </AdminGuard>
        )}
      </Route>
      <Route path="/admin/candidates">
        {() => (
          <AdminGuard>
            <AdminCandidates />
          </AdminGuard>
        )}
      </Route>
      <Route path="/admin/candidates/:id">
        {() => (
          <AdminGuard>
            <CandidateDetail />
          </AdminGuard>
        )}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
