import {useQuery, useQueryClient, type QueryClient} from "@tanstack/react-query";
import {createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode} from "react";
import {ArrowUpRight, Boxes, Eye, EyeOff, LockKeyhole, ShieldAlert, ShieldCheck, Store, UserRound, WalletCards} from "lucide-react";
import {authApi, type AuthSession} from "@/src/services/api/endpoints/auth";
import {ApiError, clearBrowserAuthState} from "@/src/services/api/client";
import {queryKeys} from "@/src/services/api/query-keys";
import {Button, Card, Input} from "@/src/components/ui";
// Import these leaf components directly. The common barrel also exports
// ErpAiDrawer, which consumes useAuth through the auth barrel and would make
// the app shell/auth chunk graph circular during Rollup code splitting.
import {ErpLoadingState} from "@/src/components/common/ErpLoadingState";
import {ErpPageError} from "@/src/components/common/ErpPageError";

type AuthContextValue = {
  session: AuthSession | null;
  status: "loading" | "authenticated" | "unauthenticated" | "error";
  error: Error | null;
  login: (username: string, password: string) => Promise<AuthSession>;
  logout: () => void;
  refresh: () => Promise<unknown>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Business queries are tenant/user scoped. They must not survive a session
 * expiry or a user switch, otherwise the next session can briefly render the
 * previous operator's cached business data.
 */
function clearBusinessQueryCache(queryClient: QueryClient) {
  queryClient.removeQueries({predicate: ({queryKey}) => queryKey[0] !== "auth"});
}

export function AuthProvider({children}: {children: ReactNode}) {
  const queryClient = useQueryClient();
  const [signedOut, setSignedOut] = useState(false);
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session(),
    queryFn: async ({signal}) => {
      const session = await authApi.session(signal);
      if (session.initialState) queryClient.setQueryData(queryKeys.state.initial(), session.initialState);
      return session;
    },
    select: ({initialState: _initialState, ...session}) => session,
    enabled: !signedOut,
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    const onExpired = () => {
      clearBrowserAuthState();
      setSignedOut(true);
      clearBusinessQueryCache(queryClient);
      queryClient.removeQueries({queryKey: queryKeys.auth.session()});
    };
    window.addEventListener("gpu-erp:auth-expired", onExpired);
    return () => window.removeEventListener("gpu-erp:auth-expired", onExpired);
  }, [queryClient]);

  useEffect(() => {
    if (sessionQuery.error instanceof ApiError && sessionQuery.error.isUnauthorized) {
      clearBrowserAuthState();
      setSignedOut(true);
      clearBusinessQueryCache(queryClient);
    }
  }, [queryClient, sessionQuery.error]);

  const value = useMemo<AuthContextValue>(() => ({
    session: sessionQuery.data || null,
    status: signedOut || (sessionQuery.error instanceof ApiError && sessionQuery.error.isUnauthorized)
      ? "unauthenticated"
      : sessionQuery.isPending
        ? "loading"
        : sessionQuery.error
          ? "error"
          : "authenticated",
    error: sessionQuery.error instanceof Error ? sessionQuery.error : null,
    async login(username, password) {
      const session = await authApi.login(username, password);
      clearBusinessQueryCache(queryClient);
      if (session.initialState) queryClient.setQueryData(queryKeys.state.initial(), session.initialState);
      const {initialState: _initialState, ...sessionForContext} = session;
      queryClient.setQueryData(queryKeys.auth.session(), sessionForContext);
      setSignedOut(false);
      return sessionForContext;
    },
    logout() {
      authApi.logout();
      clearBrowserAuthState();
      setSignedOut(true);
      queryClient.clear();
    },
    refresh() {
      return queryClient.invalidateQueries({queryKey: queryKeys.auth.session()});
    },
  }), [queryClient, sessionQuery.data, sessionQuery.error, sessionQuery.isPending, signedOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return value;
}

export function AuthBoundary({children}: {children: ReactNode}) {
  const {status, error, session, login} = useAuth();
  if (status === "loading") {
    return <div className="mx-auto max-w-xl py-16"><ErpLoadingState title="正在验证登录状态" description="正在读取当前账号的菜单和数据权限。" /></div>;
  }
  if (status === "error") {
    return <div className="mx-auto max-w-xl py-16"><ErpPageError title="登录状态读取失败" description={error?.message || "无法读取当前账号，请重试或重新登录。"} onRetry={() => window.location.reload()} /></div>;
  }
  if (!session) return <LoginView onLogin={login} />;
  return <>{children}</>;
}

function LoginView({onLogin}: {onLogin: (username: string, password: string) => Promise<AuthSession>}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      await onLogin(username.trim(), password);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败，请检查账号和密码。");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--erp-color-canvas)] px-4 py-6 sm:px-6 sm:py-10">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-12 h-64 w-64 rounded-full bg-[var(--erp-color-primary)] opacity-10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-[var(--erp-color-primary)] opacity-10 blur-3xl" />

      <Card className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-login)] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden min-h-[580px] overflow-hidden bg-[var(--erp-color-text)] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-12">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[28px] border-[var(--erp-color-primary)] opacity-30" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full border-[34px] border-white opacity-5" />

          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-[var(--erp-radius-lg)] bg-[var(--erp-color-primary)] shadow-[var(--erp-shadow-brand)]">
                <Store className="h-5 w-5" />
              </span>
              <div>
                <p className="text-base font-semibold tracking-wide">GPU ERP</p>
                <p className="mt-0.5 text-xs text-white/60">经营工作台</p>
              </div>
            </div>
            <p className="mt-16 text-xs font-semibold uppercase tracking-[0.24em] text-white/50">OPERATING DESK</p>
            <h2 className="mt-5 max-w-md text-erp-5xl font-semibold leading-tight tracking-tight">
              让库存、资金和订单，始终清晰可见。
            </h2>
            <p className="mt-6 max-w-md text-sm leading-7 text-white/65">
              从采购入库到销售出库，在同一个工作台里掌握每天的经营节奏。
            </p>
          </div>

          <div className="relative space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-[var(--erp-radius-lg)] border border-white/10 bg-white/10 p-3 backdrop-blur-sm">
                <Boxes className="h-4 w-4 text-[var(--erp-color-info-soft)]" />
                <p className="mt-3 text-xs font-semibold">库存</p>
                <p className="mt-1 text-xs text-white/50">实时掌握</p>
              </div>
              <div className="rounded-[var(--erp-radius-lg)] border border-white/10 bg-white/10 p-3 backdrop-blur-sm">
                <WalletCards className="h-4 w-4 text-[var(--erp-color-success-soft)]" />
                <p className="mt-3 text-xs font-semibold">资金</p>
                <p className="mt-1 text-xs text-white/50">清晰可追溯</p>
              </div>
              <div className="rounded-[var(--erp-radius-lg)] border border-white/10 bg-white/10 p-3 backdrop-blur-sm">
                <ArrowUpRight className="h-4 w-4 text-[var(--erp-color-warning-soft)]" />
                <p className="mt-3 text-xs font-semibold">订单</p>
                <p className="mt-1 text-xs text-white/50">流程可跟进</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/45">
              <ShieldCheck className="h-4 w-4" />
              <span>授权账号登录 · 权限按角色生效</span>
            </div>
          </div>
        </section>

        <section className="min-w-0 p-6 sm:p-10 lg:p-12">
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[var(--erp-radius-lg)] bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]">
                <Store className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[var(--erp-color-text)]">GPU ERP</p>
                <p className="mt-0.5 text-xs text-[var(--erp-color-text-muted)]">经营工作台</p>
              </div>
            </div>
            <span className="rounded-full bg-[var(--erp-color-info-soft)] px-3 py-1 text-xs font-semibold text-[var(--erp-color-primary)]">员工登录</span>
          </div>

          <div className="mt-8 lg:mt-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--erp-color-primary)]">WELCOME BACK</p>
            <h1 className="mt-3 text-erp-3xl font-semibold tracking-tight text-[var(--erp-color-text)] sm:text-erp-4xl">登录经营工作台</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--erp-color-text-secondary)]">使用授权账号继续处理今天的业务。</p>
          </div>

          <form className="mt-9 space-y-5" onSubmit={submit}>
            <div>
              <label htmlFor="login-username" className="text-sm font-semibold text-[var(--erp-color-text)]">账号</label>
              <div className="relative mt-2">
                <UserRound aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" />
                <Input id="login-username" className="pl-10" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="请输入账号" aria-invalid={Boolean(message)} aria-describedby={message ? "login-error" : undefined} required />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="login-password" className="text-sm font-semibold text-[var(--erp-color-text)]">密码</label>
                <span className="text-xs text-[var(--erp-color-text-muted)]">安全登录</span>
              </div>
              <div className="relative mt-2">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" />
                <Input id="login-password" className="pl-10 pr-11" value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="请输入密码" aria-invalid={Boolean(message)} aria-describedby={message ? "login-error" : undefined} required />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 text-[var(--erp-color-text-muted)]" aria-label={showPassword ? "隐藏密码" : "显示密码"} title={showPassword ? "隐藏密码" : "显示密码"} onClick={() => setShowPassword((visible) => !visible)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {message && <div id="login-error" role="alert" aria-live="assertive" className="flex items-start gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-danger)]/20 bg-[var(--erp-color-danger-soft)] px-3 py-2.5 text-xs leading-5 text-[var(--erp-color-danger)]"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p>{message}</p></div>}
            <Button className="w-full shadow-[var(--erp-shadow-primary)]" size="lg" type="submit" variant="primary" disabled={pending}>{pending ? "登录中…" : "登录并继续"}<ArrowUpRight className="h-4 w-4" /></Button>
          </form>

          <div className="mt-8 flex items-start gap-2 border-t border-[var(--erp-color-border)] pt-5 text-xs leading-5 text-[var(--erp-color-text-muted)]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--erp-color-success)]" />
            <p>仅限授权员工使用。登录后将按当前账号角色展示可访问的业务模块。</p>
          </div>
        </section>
      </Card>
    </main>
  );
}
