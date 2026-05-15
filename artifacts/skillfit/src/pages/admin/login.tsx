import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useAdminLogin, getGetAdminMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const schema = z.object({
  username: z.string().min(1, "Username required"),
  password: z.string().min(1, "Password required"),
});
type FormData = z.infer<typeof schema>;

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const loginMutation = useAdminLogin();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  async function onSubmit(data: FormData) {
    try {
      await loginMutation.mutateAsync({ data });
      await queryClient.invalidateQueries({ queryKey: getGetAdminMeQueryKey() });
      navigate("/admin");
    } catch {
      form.setError("password", { message: "Invalid credentials. Try admin / admin123" });
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-sidebar flex items-center justify-center mx-auto mb-4">
            <span className="text-xl font-bold text-white">KA</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Officer Login</h1>
          <p className="text-sm text-muted-foreground mt-1">AI SkillFit — Admin Portal</p>
        </div>

        <div className="bg-card border border-card-border rounded-xl shadow-sm p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input data-testid="input-username" placeholder="admin" {...field} className="h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-password"
                        type="password"
                        placeholder="••••••••"
                        {...field}
                        className="h-11"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <button
                data-testid="btn-login"
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full bg-primary text-white font-semibold py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 mt-2"
              >
                {loginMutation.isPending ? "Logging in..." : "Sign In"}
              </button>
            </form>
          </Form>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Sign in with a seeded admin account, or use the one-time env fallback (admin / admin123) until you run the admin seed script.
        </p>
      </div>
    </div>
  );
}
